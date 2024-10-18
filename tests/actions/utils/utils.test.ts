import { expect, ethers, Signer } from '../..';
import { AdminVault, Logger, PullToken, SendToken, IERC20Metadata } from '../../../typechain-types';
// import { IERC20Metadata } from '../../../typechain-types/contracts/interfaces/IERC20Metadata';
import { getBaseSetup, deploy, executeAction } from '../../utils';
import { fundAccountWithToken, getUSDC, getUSDT } from '../../utils-stable';
import { tokenConfig } from '../../constants';

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
    it.skip('should emit the correct log', async () => {
      // TODO: Implement this test
    });
  });
});
