// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {IMorphoBlue, Id, MarketParams, Position, Market} from "../../interfaces/morpho-markets/IMorphoBlue.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title MorphoMarketsSupply - Supplies tokens directly to a Morpho Blue market
/// @notice Morpho Blue markets are NOT ERC4626; this action interacts with the Morpho Blue
///         singleton contract directly using market-level supply/withdraw functions.
/// @dev The Morpho Blue singleton address is read from AdminVault via _configAddress().
///      Each market is whitelisted individually: marketKey = address(uint160(uint256(marketId)))
///      is registered as a pool in AdminVault, so authorization binds the exact market
///      (and therefore its full MarketParams), not just the shared loan token.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract MorphoMarketsSupply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Virtual shares/assets used by Morpho Blue's SharesMathLib for
    ///         share<->asset conversion; mirroring them keeps our position
    ///         valuation identical to what Morpho enforces on-chain.
    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant VIRTUAL_ASSETS = 1;

    /// @notice Parameters for the supply action
    /// @param marketId The Morpho Blue market identifier (keccak256 of MarketParams); the whitelist unit
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying loan token to supply (type(uint256).max for full balance)
    /// @param minSharesReceived Minimum Morpho supply shares to receive (slippage protection)
    struct Params {
        bytes32 marketId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);

        // Authorize the exact market: marketKey is derived from the marketId and must be a
        // whitelisted pool. This binds approval to the full MarketParams, not the shared loan token.
        address marketKey = address(uint160(uint256(inputData.marketId)));
        bytes4 poolId = _poolIdFromAddress(marketKey);
        require(
            ADMIN_VAULT.getPoolAddress(protocolName(), poolId) == marketKey,
            Errors.InvalidInput(protocolName(), "marketId")
        );

        IMorphoBlue morpho = IMorphoBlue(_configAddress());
        Id id = Id.wrap(inputData.marketId);
        MarketParams memory marketParams = morpho.idToMarketParams(id);

        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _supplyToMarket(
            inputData, morpho, id, marketParams, marketKey
        );

        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    function _supplyToMarket(
        Params memory _inputData,
        IMorphoBlue _morpho,
        Id _id,
        MarketParams memory _marketParams,
        address _marketKey
    ) private returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        sharesBefore = _morpho.position(_id, address(this)).supplyShares;

        feeInTokens = _processMorphoFee(_morpho, _id, _marketParams, _marketKey, _inputData.feeBasis);

        if (_inputData.amount != 0) {
            IERC20 underlyingToken = IERC20(_marketParams.loanToken);
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? underlyingToken.balanceOf(address(this))
                : _inputData.amount;

            require(
                amountToDeposit != 0,
                Errors.Action_ZeroAmount(_marketParams.loanToken, protocolName(), uint8(actionType()))
            );

            underlyingToken.safeIncreaseAllowance(address(_morpho), amountToDeposit);

            (, uint256 sharesReceived) = _morpho.supply(
                _marketParams, amountToDeposit, 0, address(this), ""
            );

            require(
                sharesReceived >= _inputData.minSharesReceived,
                Errors.Action_InsufficientSharesReceived(
                    _marketParams.loanToken,
                    protocolName(),
                    uint8(actionType()),
                    sharesReceived,
                    _inputData.minSharesReceived
                )
            );
        }

        sharesAfter = _morpho.position(_id, address(this)).supplyShares;
    }

    /// @notice Processes fees for a Morpho Blue position by withdrawing underlying from the market
    /// @dev Morpho Blue positions are not ERC20 tokens, so fees are taken in the underlying
    ///      loan token by partially withdrawing from the supply position. The fee timestamp is
    ///      keyed per-market (marketKey), so markets sharing a loan token accrue independently.
    function _processMorphoFee(
        IMorphoBlue _morpho,
        Id _id,
        MarketParams memory _marketParams,
        address _marketKey,
        uint256 _feeBasis
    ) private returns (uint256 feeInTokens) {
        address feeKey = _marketKey;
        uint256 lastFeeTimestamp = ADMIN_VAULT.getLastFeeTimestamp(feeKey);

        if (lastFeeTimestamp == 0) {
            ADMIN_VAULT.setFeeTimestamp(feeKey);
            return 0;
        }

        uint256 currentTimestamp = block.timestamp;
        if (lastFeeTimestamp == currentTimestamp) {
            return 0;
        }

        Position memory pos = _morpho.position(_id, address(this));
        if (pos.supplyShares == 0) {
            ADMIN_VAULT.setFeeTimestamp(feeKey);
            return 0;
        }

        _morpho.accrueInterest(_marketParams);
        Market memory mkt = _morpho.market(_id);

        uint256 positionAssets = _toAssetsDown(pos.supplyShares, mkt);
        uint256 fee = _calculateFee(positionAssets, _feeBasis, lastFeeTimestamp, currentTimestamp);

        // Record the fee timestamp before withdrawing/transferring the fee (checks-effects-interactions)
        // so a callback-capable loan token cannot re-enter on a stale timestamp and collect twice.
        ADMIN_VAULT.setFeeTimestamp(feeKey);

        if (fee > 0) {
            (uint256 actualFee,) = _morpho.withdraw(_marketParams, fee, 0, address(this), address(this));
            IERC20(_marketParams.loanToken).safeTransfer(ADMIN_VAULT.feeConfig().recipient, actualFee);
            feeInTokens = actualFee;
        }
    }

    /// @notice Converts supply shares to assets, matching Morpho Blue's
    ///         SharesMathLib.toAssetsDown semantics
    function _toAssetsDown(uint256 _shares, Market memory _mkt) private pure returns (uint256) {
        return (_shares * (uint256(_mkt.totalSupplyAssets) + VIRTUAL_ASSETS))
            / (uint256(_mkt.totalSupplyShares) + VIRTUAL_SHARES);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "MorphoMarkets";
    }
}
