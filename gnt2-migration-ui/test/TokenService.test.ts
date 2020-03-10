import {DepositState, TokensService} from '../src/services/TokensService';
import {createMockProvider, getWallets, solidity} from 'ethereum-waffle';
import {deployDevGolemContracts, GNTDepositFactory, GolemContractsDeploymentAddresses} from 'gnt2-contracts';
import {utils} from 'ethers';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import {ContractAddressService} from '../src/services/ContractAddressService';
import {State} from 'reactive-properties';
import {ContractAddresses} from '../src/config';
import {NOPLogger} from '../../gnt2-contracts/test/utils';
import {parseEther} from 'ethers/utils';
import {GNTDeposit} from 'gnt2-contracts/build/contract-types/GNTDeposit';

chai.use(solidity);
chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Token Service', () => {
  const provider = createMockProvider();
  const [holder, deployWallet, anotherWallet] = getWallets(provider);
  let addresses: GolemContractsDeploymentAddresses;
  let tokensService: TokensService;

  beforeEach(async () => {
    addresses = await deployDevGolemContracts(provider, deployWallet, holder, NOPLogger);
    const contractAddressService = {
      contractAddresses: new State<ContractAddresses>(addresses)
    } as unknown as ContractAddressService;
    tokensService = new TokensService(() => provider, contractAddressService);
  });

  it('gets account balance', async () => {
    expect(await tokensService.balanceOfOldTokens(holder.address)).to.eq(utils.parseEther('140000000.0'));
  });

  describe('migrateTokens', () => {

    it('migrates all tokens and returns transaction hash', async () => {
      const result = await tokensService.migrateAllTokens(holder.address);
      expect(await tokensService.balanceOfOldTokens(holder.address)).to.eq(0);
      expect(result.hash).to.match(/0x[0-9a-fA-F]{64}/);
    });
  });

  describe('changes deposit state', () => {

    it('"Unlock" changes from "Locked" to "Time locked"', async () => {
      expect(await tokensService.isDepositLocked(holder.address)).to.equal(DepositState.LOCKED);
      await tokensService.unlockDeposit();
      expect(await tokensService.isDepositLocked(holder.address)).to.equal(DepositState.TIME_LOCKED);
    });

  });

  describe('getDepositState', () => {
    let gntDeposit: GNTDeposit;

    beforeEach(async () => {
      gntDeposit = GNTDepositFactory.connect(addresses.gntDeposit, provider.getSigner());
    });

    it('returns state of locked deposit', async () => {
      expect(await gntDeposit.balanceOf(holder.address)).to.equal(parseEther('100'));
      expect(await tokensService.isDepositLocked(holder.address)).to.equal(DepositState.LOCKED);
    });

    it('returns state of empty deposit', async () => {
      expect(await gntDeposit.balanceOf(anotherWallet.address)).to.equal(parseEther('0'));
      expect(await tokensService.isDepositLocked(anotherWallet.address)).to.equal(DepositState.EMPTY);
    });

    it('returns state of time-locked deposit', async () => {
      await (await gntDeposit.unlock()).wait();
      expect(await tokensService.isDepositLocked(holder.address)).to.equal(DepositState.TIME_LOCKED);
    });
  });
});
