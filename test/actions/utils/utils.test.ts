import { expect, ethers, Signer } from '../..';
import {
  AdminVault,
  Logger,
  PullToken,
  SendToken,
  IERC20Metadata,
  SequenceExecutor,
} from '../../../typechain-types';
import {
  getBaseSetup,
  deploy,
  executeAction,
  decodeLoggerLog,
  encodeAction,
  executeSequence,
  getBytes4,
  getTypedContract,
} from '../../utils';
import { fundAccountWithToken, getTokenContract } from '../../utils-stable';
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
    logger = await getTypedContract<Logger>('Logger', loggerAddress);
    adminVault = await baseSetup.adminVault;

    // Fetch the USDC and USDT tokens
    USDC = await getTokenContract('USDC');
    USDT = await getTokenContract('USDT');

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
    // Register SendToken action with AdminVault so SequenceExecutor can execute it
    const sendTokenId = getBytes4(sendTokenAddress);
    await adminVault.proposeAction(sendTokenId, sendTokenAddress);
    await adminVault.addAction(sendTokenId, sendTokenAddress);
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
      const fundTx1 = await signer.sendTransaction({
        to: safeAddr,
        value: sendAmount,
      });
      await fundTx1.wait();

      // Ensure Safe has sufficient balance prior to sending

      const initialSafeBalance = await ethers.provider.getBalance(safeAddr);
      const recipient = await signer.getAddress();
      const initialRecipientBalance = await ethers.provider.getBalance(recipient);
      // Sanity checks
      const ownerManager = await ethers.getContractAt('IOwnerManager', safeAddr);
      expect(await ownerManager.isOwner(recipient)).to.be.true;
      expect(initialSafeBalance).to.equal(sendAmount);

      // Ensure we don't revert the base setup snapshot (avoid getBaseSetup here)

      const sendPayload = await encodeAction({
        type: 'SendToken',
        tokenAddress: ETH_ADDRESS,
        amount: sendAmount,
        to: await signer.getAddress(),
      });
      const seq: SequenceExecutor.SequenceStruct = {
        name: 'SendETHSequence',
        callData: [sendPayload],
        actionIds: [getBytes4(sendTokenAddress)],
      };
      // Sanity: AdminVault action mapping must exist
      expect(await adminVault.getActionAddress(getBytes4(sendTokenAddress))).to.equal(
        sendTokenAddress
      );
      // Re-register to ensure mapping exists even if snapshot altered state
      try {
        await adminVault.proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
        await adminVault.addAction(getBytes4(sendTokenAddress), sendTokenAddress);
      } catch (e: any) {
        if (!(`${e?.message || ''}`.includes('AlreadyAdded'))) {
          throw e;
        }
      }
      await executeSequence(safeAddr, seq);

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
      const fundTx2 = await signer.sendTransaction({
        to: safeAddr,
        value: safeBalance,
      });
      await fundTx2.wait();

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
      const fundTx3 = await signer.sendTransaction({
        to: safeAddr,
        value: sendAmount,
      });
      await fundTx3.wait();

      // Ensure Safe has sufficient balance prior to sending

      const sendPayload2 = await encodeAction({
        type: 'SendToken',
        tokenAddress: ETH_ADDRESS,
        amount: sendAmount,
        to: await signer.getAddress(),
      });
      const seq2: SequenceExecutor.SequenceStruct = {
        name: 'SendETHSequenceLog',
        callData: [sendPayload2],
        actionIds: [getBytes4(sendTokenAddress)],
      };
      expect(await adminVault.getActionAddress(getBytes4(sendTokenAddress))).to.equal(
        sendTokenAddress
      );
      try {
        await adminVault.proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
        await adminVault.addAction(getBytes4(sendTokenAddress), sendTokenAddress);
      } catch (e: any) {
        if (!(`${e?.message || ''}`.includes('AlreadyAdded'))) {
          throw e;
        }
      }
      const tx = await executeSequence(safeAddr, seq2);

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
      const fundTx4 = await signer.sendTransaction({
        to: safeAddr,
        value: safeBalance,
      });
      await fundTx4.wait();

      // Ensure Safe has sufficient balance prior to sending

      const initialSafeBalance = await ethers.provider.getBalance(safeAddr);
      const initialRecipientBalance = await ethers.provider.getBalance(await signer.getAddress());

      const sendPayload3 = await encodeAction({
        type: 'SendToken',
        tokenAddress: ETH_ADDRESS,
        amount: ethers.MaxUint256,
        to: await signer.getAddress(),
      });
      const seq3: SequenceExecutor.SequenceStruct = {
        name: 'SendETHMaxSequence',
        callData: [sendPayload3],
        actionIds: [getBytes4(sendTokenAddress)],
      };
      expect(await adminVault.getActionAddress(getBytes4(sendTokenAddress))).to.equal(
        sendTokenAddress
      );
      try {
        await adminVault.proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
        await adminVault.addAction(getBytes4(sendTokenAddress), sendTokenAddress);
      } catch (e: any) {
        if (!(`${e?.message || ''}`.includes('AlreadyAdded'))) {
          throw e;
        }
      }
      await executeSequence(safeAddr, seq3);

      const finalSafeBalance = await ethers.provider.getBalance(safeAddr);
      const finalRecipientBalance = await ethers.provider.getBalance(await signer.getAddress());

      expect(finalSafeBalance).to.equal(0); // Should send entire balance
      expect(finalRecipientBalance).to.be.gt(initialRecipientBalance);
    });

    it('Should fail to send tokens without fees paid', async () => {
      const fundAmount = ethers.parseUnits('1000', tokenConfig.USDC.decimals);
      const sendAmount = ethers.parseUnits('100', tokenConfig.USDC.decimals);
      await fundAccountWithToken(safeAddr, 'FLUID_V1_USDC', fundAmount);
      await fundAccountWithToken(safeAddr, 'USDC', fundAmount);

      const fluidSupplyContract = await deploy(
        'FluidV1Supply',
        signer,
        await adminVault.getAddress(),
        loggerAddress
      );
      const fluidSupplyAddress = await fluidSupplyContract.getAddress();

      await adminVault.proposePool('FluidV1', tokenConfig.FLUID_V1_USDC.address);
      await adminVault.addPool('FluidV1', tokenConfig.FLUID_V1_USDC.address);
      await adminVault.proposeAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      await adminVault.addAction(getBytes4(fluidSupplyAddress), fluidSupplyAddress);
      try {
        await adminVault.proposeAction(getBytes4(sendTokenAddress), sendTokenAddress);
        await adminVault.addAction(getBytes4(sendTokenAddress), sendTokenAddress);
      } catch (e: any) {
        if (!(`${e?.message || ''}`.includes('AlreadyAdded'))) {
          throw e;
        }
      }

      const supplyPayload = await encodeAction({
        type: 'FluidV1Supply',
        poolAddress: tokenConfig.FLUID_V1_USDC.address,
        amount: '0',
      });
      const sendPayload = await encodeAction({
        type: 'SendToken',
        token: 'FLUID_V1_USDC',
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
      const fundTx5 = await signer.sendTransaction({
        to: safeAddr,
        value: sendAmount,
      });
      await fundTx5.wait();

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
