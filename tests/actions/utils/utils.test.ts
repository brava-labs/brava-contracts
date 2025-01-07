import { expect, ethers, Signer } from '../..';
import { AdminVault, Logger, PullToken, SendToken, IERC20Metadata, SequenceExecutor } from '../../../typechain-types';
import { getBaseSetup, deploy, executeAction, decodeLoggerLog, encodeAction, executeSequence, getBytes4} from '../../utils';
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';
import { tokenConfig, ETH_ADDRESS } from '../../constants';
import { ACTION_LOG_IDS } from '../../logs';

describe('Utils tests', () => {
  let signer: Signer;
  let safeAddr: string;
  let loggerAddress: string;
  let logger: Logger;
  let snapshotId: string;
  let USDC: IERC20Metadata;
  let USDT: IERC20Metadata;
  let pullTokenContract: PullToken;
  let sendTokenContract: SendToken;
  let pullTokenAddress: string;
  let sendTokenAddress: string;
  let adminVault: AdminVault;

  before(async () => {
    [signer] = await ethers.getSigners();
    const baseSetup = await getBaseSetup(signer);
    if (!baseSetup) {
      throw new Error('Base setup not deployed');
    }
    safeAddr = (await baseSetup.safe.getAddress()) as string;
    loggerAddress = (await baseSetup.logger.getAddress()) as string;
    logger = await ethers.getContractAt('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;

    // Fetch the USDC and USDT tokens
    USDC = await getUSDC();
    USDT = await getUSDT();

    // Initialize PullToken and SendToken actions
    pullTokenContract = await deploy(
      'PullToken',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    sendTokenContract = await deploy(
      'SendToken',
      signer,
      await adminVault.getAddress(),
      loggerAddress
    );
    pullTokenAddress = await pullTokenContract.getAddress();
    sendTokenAddress = await sendTokenContract.getAddress();
  });

  beforeEach(async () => {
    snapshotId = await ethers.provider.send('evm_snapshot', []);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshotId]);
  });

  describe('PullToken', () => {
    it('Should pull USDC into the safe', async () => {
      const pullAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(await signer.getAddress(), 'USDC', pullAmount);

      const initialSafeBalance = await USDC.balanceOf(safeAddr);
      const initialSignerBalance = await USDC.balanceOf(await signer.getAddress());

      await USDC.connect(signer).approve(safeAddr, pullAmount);

      await executeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: pullAmount,
        from: await signer.getAddress(),
      });

      const finalSafeBalance = await USDC.balanceOf(safeAddr);
      const finalSignerBalance = await USDC.balanceOf(await signer.getAddress());

      expect(finalSafeBalance).to.equal(initialSafeBalance + pullAmount);
      expect(finalSignerBalance).to.equal(initialSignerBalance - pullAmount);
    });

    it('Should fail to pull tokens without approval', async () => {
      const pullAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(await signer.getAddress(), 'USDC', pullAmount);

      await expect(
        executeAction({
          type: 'PullToken',
          token: 'USDC',
          amount: pullAmount,
          from: await signer.getAddress(),
        })
      ).to.be.revertedWith('GS013');
    });
    it.skip('should emit the correct log', async () => {
      // TODO: Implement this test
    });
    it('Should emit the correct log when pulling USDC', async () => {
      const pullAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
      await fundAccountWithToken(await signer.getAddress(), 'USDC', pullAmount);

      await USDC.connect(signer).approve(safeAddr, pullAmount);

      const tx = await executeAction({
        type: 'PullToken',
        token: 'USDC',
        amount: pullAmount,
        from: await signer.getAddress(),
      });

      const logs = await decodeLoggerLog(tx);
      expect(logs).to.deep.equal([
        {
          eventId: BigInt(ACTION_LOG_IDS.PULL_TOKEN),
          safeAddress: safeAddr,
          tokenAddr: await USDC.getAddress(),
          from: await signer.getAddress(),
          amount: pullAmount.toString(),
        },
      ]);
    });
  });

  describe('SendToken', () => {
    it('Should send USDT from the safe', async () => {
      const sendAmount = ethers.parseUnits('1000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', sendAmount);

      const initialSafeBalance = await USDT.balanceOf(safeAddr);
      const initialRecipientBalance = await USDT.balanceOf(await signer.getAddress());

      await executeAction({
        type: 'SendToken',
        token: 'USDT',
        amount: sendAmount,
        to: await signer.getAddress(),
      });

      const finalSafeBalance = await USDT.balanceOf(safeAddr);
      const finalRecipientBalance = await USDT.balanceOf(await signer.getAddress());

      expect(finalSafeBalance).to.equal(initialSafeBalance - sendAmount);
      expect(finalRecipientBalance).to.equal(initialRecipientBalance + sendAmount);
    });

    it('Should fail to send more tokens than available in the safe', async () => {
      const safeBalance = ethers.parseUnits('1000', tokenConfig.USDT.decimals);
      const sendAmount = ethers.parseUnits('2000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', safeBalance);

      await expect(
        executeAction({
          type: 'SendToken',
          token: 'USDT',
          amount: sendAmount,
          to: await signer.getAddress(),
        })
      ).to.be.revertedWith('GS013');
    });
    it('Should emit the correct log when sending USDT', async () => {
      const sendAmount = ethers.parseUnits('1000', tokenConfig.USDT.decimals);
      await fundAccountWithToken(safeAddr, 'USDT', sendAmount);

      const tx = await executeAction({
        type: 'SendToken',
        token: 'USDT',
        amount: sendAmount,
        to: await signer.getAddress(),
      });

      const logs = await decodeLoggerLog(tx);
      expect(logs).to.deep.equal([
        {
          eventId: BigInt(ACTION_LOG_IDS.SEND_TOKEN),
          safeAddress: safeAddr,
          tokenAddr: await USDT.getAddress(),
          to: await signer.getAddress(),
          amount: sendAmount.toString(),
        },
      ]);
    });

    it('Should send ETH from the safe', async () => {
      const sendAmount = ethers.parseEther('1.0');
      
      // Fund the safe with ETH
      await signer.sendTransaction({
        to: safeAddr,
        value: sendAmount
      });

      const initialSafeBalance = await ethers.provider.getBalance(safeAddr);
      const initialRecipientBalance = await ethers.provider.getBalance(await signer.getAddress());

      await executeAction({
        type: 'SendToken',
        tokenAddress: ETH_ADDRESS,
        amount: sendAmount,
        to: await signer.getAddress(),
      });

      const finalSafeBalance = await ethers.provider.getBalance(safeAddr);
      const finalRecipientBalance = await ethers.provider.getBalance(await signer.getAddress());

      expect(finalSafeBalance).to.equal(initialSafeBalance - sendAmount);
      // For ETH transfers we can't check exact recipient balance due to gas costs
      expect(finalRecipientBalance).to.be.gt(initialRecipientBalance);
    });

    it('Should fail to send more ETH than available in the safe', async () => {
      const safeBalance = ethers.parseEther('1.0');
      const sendAmount = ethers.parseEther('2.0');
      
      // Fund the safe with ETH
      await signer.sendTransaction({
        to: safeAddr,
        value: safeBalance
      });

      await expect(
        executeAction({
          type: 'SendToken',
          tokenAddress: ETH_ADDRESS,
          amount: sendAmount,
          to: await signer.getAddress(),
        })
      ).to.be.revertedWith('GS013');
    });

    it('Should emit the correct log when sending ETH', async () => {
      const sendAmount = ethers.parseEther('1.0');
      
      // Fund the safe with ETH
      await signer.sendTransaction({
        to: safeAddr,
        value: sendAmount
      });

      const tx = await executeAction({
        type: 'SendToken',
        tokenAddress: ETH_ADDRESS,
        amount: sendAmount,
        to: await signer.getAddress(),
      });

      const logs = await decodeLoggerLog(tx);
      expect(logs).to.deep.equal([
        {
          eventId: BigInt(ACTION_LOG_IDS.SEND_TOKEN),
          safeAddress: safeAddr,
          tokenAddr: ETH_ADDRESS,
          to: await signer.getAddress(),
          amount: sendAmount.toString(),
        },
      ]);
    });

    it('Should send max ETH balance when amount is type(uint256).max', async () => {
      const safeBalance = ethers.parseEther('1.0');
      
      // Fund the safe with ETH
      await signer.sendTransaction({
        to: safeAddr,
        value: safeBalance
      });

      const initialSafeBalance = await ethers.provider.getBalance(safeAddr);
      const initialRecipientBalance = await ethers.provider.getBalance(await signer.getAddress());

      await executeAction({
        type: 'SendToken',
        tokenAddress: ETH_ADDRESS,
        amount: ethers.MaxUint256,
        to: await signer.getAddress(),
      });

      const finalSafeBalance = await ethers.provider.getBalance(safeAddr);
      const finalRecipientBalance = await ethers.provider.getBalance(await signer.getAddress());

      expect(finalSafeBalance).to.equal(0); // Should send entire balance
      expect(finalRecipientBalance).to.be.gt(initialRecipientBalance);
    });

    it('Should fail to send tokens without fees paid', async () => {
      const fundAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
      const sendAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'fUSDC', fundAmount);
      await fundAccountWithToken(safeAddr, 'USDC', fundAmount);

      const fluidSupplyContract = await deploy('FluidSupply', signer, await adminVault.getAddress(), loggerAddress);
      const fluidSupplyAddress = await fluidSupplyContract.getAddress();

      await adminVault.proposePool('Fluid', tokenConfig.fUSDC.address);
      await adminVault.addPool('Fluid', tokenConfig.fUSDC.address);
      await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      await adminVault.proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
      await adminVault.addAction(getBytes4(sendTokenAddress), sendTokenAddress);

        const supplyPayload = await encodeAction({
          type: 'FluidSupply',
          poolAddress: tokenConfig.fUSDC.address,
          amount: '0',
        });
        const sendPayload = await encodeAction({
          type: 'SendToken',
          token: 'fUSDC',
          amount: sendAmount,
          to: await signer.getAddress(),
        });

        /// A sequence with only a supply action, used to set the fee timestamp
        const supplySequence: SequenceExecutor.SequenceStruct = {
          name: 'SupplySequence',
          callData: [supplyPayload],
          actionIds: [getBytes4(fluidSupplyAddress)],
        };

        /// A sequence with only a send action, used to send the tokens
        const sendSequence: SequenceExecutor.SequenceStruct = {
          name: 'SendSequence',
          callData: [sendPayload],
          actionIds: [getBytes4(sendTokenAddress)],
        };
        /// A sequence with both a supply and send action, used to take fees and then send the tokens
        const feeTakeSequence: SequenceExecutor.SequenceStruct = {
          name: 'FeeTakeSequence',
          callData: [supplyPayload, sendPayload],
          actionIds: [getBytes4(fluidSupplyAddress), getBytes4(sendTokenAddress)],
        };

        // Firstly just sending should work because we haven't set the fee timestamp yet
        const sendSequenceTx = await executeSequence(safeAddr, sendSequence);
        await sendSequenceTx.wait();
        
        // Now perform a supply to set the fee timestamp
        const supplySequenceTx = await executeSequence(safeAddr, supplySequence);
        await supplySequenceTx.wait();

        // Now we should fail to send because the fee timestamp has been set
        await expect(executeSequence(safeAddr, sendSequence)).to.be.revertedWith('GS013');

        // Now the correct way to send, take the fees and send at the same time
        const feeTakeSequenceTx = await executeSequence(safeAddr, feeTakeSequence);
        await feeTakeSequenceTx.wait();

    });

    it('Should fail to send ETH to a non-owner', async () => {
      const sendAmount = ethers.parseEther('1.0');
      const nonOwnerAddress = '0x1234567890123456789012345678901234567890';
      
      // Fund the safe with ETH
      await signer.sendTransaction({
        to: safeAddr,
        value: sendAmount
      });

      await expect(
        executeAction({
          type: 'SendToken',
          tokenAddress: ETH_ADDRESS,
          amount: sendAmount,
          to: nonOwnerAddress,
        })
      ).to.be.revertedWith('GS013');
    });
  });
});
