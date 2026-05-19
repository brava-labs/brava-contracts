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
///      Each whitelisted market's loan token is registered as a pool in AdminVault.
///      The specific market is identified by a bytes32 marketId passed in calldata.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract MorphoMarketsSupply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the supply action
    /// @param poolId Identifies the registered loan token in AdminVault
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying loan token to supply (type(uint256).max for full balance)
    /// @param minSharesReceived Minimum Morpho supply shares to receive (slippage protection)
    /// @param marketId The Morpho Blue market identifier (keccak256 of MarketParams)
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
        bytes32 marketId;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);

        address loanToken = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);
        IMorphoBlue morpho = IMorphoBlue(_configAddress());
        Id id = Id.wrap(inputData.marketId);
        MarketParams memory marketParams = morpho.idToMarketParams(id);
        require(marketParams.loanToken == loanToken, Errors.InvalidInput(protocolName(), "marketId"));

        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _supplyToMarket(
            inputData, morpho, id, marketParams
        );

        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    function _supplyToMarket(
        Params memory _inputData,
        IMorphoBlue _morpho,
        Id _id,
        MarketParams memory _marketParams
    ) private returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        sharesBefore = _morpho.position(_id, address(this)).supplyShares;

        feeInTokens = _processMorphoFee(_morpho, _id, _marketParams, _inputData.feeBasis);

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
    ///      loan token by partially withdrawing from the supply position.
    function _processMorphoFee(
        IMorphoBlue _morpho,
        Id _id,
        MarketParams memory _marketParams,
        uint256 _feeBasis
    ) private returns (uint256 feeInTokens) {
        address feeKey = _marketParams.loanToken;
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

        uint256 positionAssets = (pos.supplyShares * uint256(mkt.totalSupplyAssets)) / uint256(mkt.totalSupplyShares);
        uint256 fee = _calculateFee(positionAssets, _feeBasis, lastFeeTimestamp, currentTimestamp);

        if (fee > 0) {
            (uint256 actualFee,) = _morpho.withdraw(_marketParams, fee, 0, address(this), address(this));
            IERC20(_marketParams.loanToken).safeTransfer(ADMIN_VAULT.feeConfig().recipient, actualFee);
            feeInTokens = actualFee;
        }

        ADMIN_VAULT.setFeeTimestamp(feeKey);
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
