import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { AdminVault, Logger, IERC20 } from '../../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { getUSDC } from '../utils-stable';
import { log, deploy } from '../utils';

describe('AdminVault', function () {
  let adminVault: AdminVault;
  let admin: SignerWithAddress;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let snapshotId: string;
  let USDC: IERC20;

  before(async () => {
    [admin, owner, alice, bob, carol] = await ethers.getSigners();

    adminVault = await deploy('AdminVault', admin, owner.address, admin.address);
    // Fetch the USDC token
    USDC = await getUSDC();

    // Take local snapshot before running tests
    log('Taking local snapshot');
    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async () => {});

  afterEach(async () => {
    // Revert local snapshot after each test
    log('Reverting to local snapshot');
    await network.provider.send('evm_revert', [snapshotId]);

    // IMPORTANT: take a new snapshot, they can't be reused!
    snapshotId = await network.provider.send('evm_snapshot');
  });

  it('should set owner correctly', async function () {
    await expect(
      adminVault.connect(alice).changeOwner(alice.address)
    ).to.be.revertedWithCustomError(adminVault, 'SenderNotOwner');

    await adminVault.connect(owner).changeOwner(alice.address);
    expect(await adminVault.owner()).to.equal(alice.address);
  });

  it('should set admin correctly', async function () {
    await expect(
      adminVault.connect(alice).changeAdmin(alice.address)
    ).to.be.revertedWithCustomError(adminVault, 'SenderNotAdmin');
    // try as owner
    await adminVault.connect(owner).changeAdmin(alice.address);
    expect(await adminVault.admin()).to.equal(alice.address);

    // try as admin
    await adminVault.connect(alice).changeAdmin(bob.address);
    expect(await adminVault.admin()).to.equal(bob.address);
  });

  it('should set fee recipient correctly', async function () {
    await expect(
      adminVault.connect(alice).setFeeRecipient(alice.address)
    ).to.be.revertedWithCustomError(adminVault, 'SenderNotOwner');

    await expect(
      adminVault.connect(owner).setFeeRecipient(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(adminVault, 'InvalidRecipient');

    await adminVault.connect(owner).setFeeRecipient(alice.address);
    expect(await adminVault.feeRecipient()).to.equal(alice.address);
  });

  it('should set fee percentage correctly', async function () {
    await expect(adminVault.connect(alice).setFeeRange(100, 200)).to.be.revertedWithCustomError(
      adminVault,
      'SenderNotAdmin'
    );

    await expect(adminVault.connect(owner).setFeeRange(200, 100)).to.be.revertedWithCustomError(
      adminVault,
      'InvalidRange'
    );

    await adminVault.connect(owner).setFeeRange(100, 200);
    expect(await adminVault.minFeeBasis()).to.equal(100);
    expect(await adminVault.maxFeeBasis()).to.equal(200);
  });
  it('should initialize fee timestamp correctly', async function () {
    const tx = await adminVault.connect(owner).initializeFeeTimestamp(alice.address);

    const receipt = await tx.wait();
    const blockTimestamp = (await ethers.provider.getBlock(receipt!.blockNumber))!.timestamp;
    expect(await adminVault.lastFeeTimestamp(owner.address, alice.address)).to.equal(
      blockTimestamp
    );
  });

  it('should update fee timestamp correctly', async function () {
    await adminVault.connect(owner).initializeFeeTimestamp(alice.address);
    const tx = await adminVault.connect(owner).updateFeeTimestamp(alice.address);
    const receipt = await tx.wait();
    const blockTimestamp = (await ethers.provider.getBlock(receipt!.blockNumber))!.timestamp;
    expect(await adminVault.lastFeeTimestamp(owner.address, alice.address)).to.equal(
      blockTimestamp
    );
  });

  it('should calculate fee correctly for a given period', async function () {
    await adminVault.connect(owner).setFeeRange(100, 200);
    expect(await adminVault.minFeeBasis()).to.equal(100);
    expect(await adminVault.maxFeeBasis()).to.equal(200);
  });

  it.skip('should withdraw fees correctly', async function () {
    await adminVault.setFeeRecipient(user.address);
    await mockToken.mint(adminVault.getAddress(), ethers.parseEther('100'));

    await expect(
      adminVault.connect(user).withdrawFees(mockToken.getAddress(), ethers.parseEther('50'))
    ).to.be.revertedWith('Caller is not the admin');

    await adminVault.connect(owner).withdrawFees(mockToken.getAddress(), ethers.parseEther('50'));
    expect(await mockToken.balanceOf(user.address)).to.equal(ethers.parseEther('50'));
  });

  it.skip('should recover ETH correctly', async function () {
    const initialBalance = await ethers.provider.getBalance(owner.address);
    await adminVault
      .connect(owner)
      .withdrawStuckFunds(ethers.ZeroAddress, owner.address, ethers.parseEther('100'));
    const finalBalance = await ethers.provider.getBalance(owner.address);
    expect(finalBalance).to.equal(initialBalance + ethers.parseEther('100'));
  });

  it.skip('should recover ERC20 tokens correctly', async function () {
    await mockToken.mint(adminVault.getAddress(), ethers.parseEther('100'));

    await expect(
      adminVault.connect(user).recoverERC20(mockToken.getAddress(), ethers.parseEther('50'))
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await adminVault.recoverERC20(mockToken.getAddress(), ethers.parseEther('50'));
    expect(await mockToken.balanceOf(owner.address)).to.equal(ethers.parseEther('50'));
  });
});
