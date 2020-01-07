import {utils, Wallet} from 'ethers';
import {NewGolemNetworkTokenFactory} from 'gnt2-contracts';
import {GolemNetworkTokenFactory} from '../../build/contract-types/GolemNetworkTokenFactory';
import {JsonRpcProvider, Provider} from 'ethers/providers';
import {ConsoleLogger, Logger} from '../utils/logger';
import {GolemNetworkTokenBatchingFactory} from '../../build/contract-types/GolemNetworkTokenBatchingFactory';
import {GolemNetworkTokenBatching} from '../../build/contract-types/GolemNetworkTokenBatching';
import {GolemNetworkToken} from '../../build/contract-types/GolemNetworkToken';
import {parseUnits} from 'ethers/utils';

export interface GolemContractsDevDeployment {
  oldGolemTokenContractAddress: string;
  newGolemTokenContractAddress: string;
  batchingGolemTokenContractAddress: string;
}

async function mineEmptyBlock(provider: Provider) {
  await (provider as JsonRpcProvider).send('evm_mine', []);
}

export async function deployOldToken(provider: Provider, deployWallet: Wallet, holder: Wallet) {
  const currentBlockNumber = await provider.getBlockNumber();
  const token = await new GolemNetworkTokenFactory(deployWallet).deploy(
    deployWallet.address,
    deployWallet.address,
    currentBlockNumber + 2,
    currentBlockNumber + 3
  );
  const holderSignedToken = await token.connect(holder);
  await holderSignedToken.create({value: utils.parseUnits('150000.0')});
  await mineEmptyBlock(provider);
  await token.finalize();
  return {token, holderSignedToken};
}

export async function transferGNTB(wallet: Wallet, token: GolemNetworkTokenBatching, oldToken: GolemNetworkToken, value: string) {
  await token.openGate();
  const gateAddress = await token.getGateAddress(wallet.address);
  await oldToken.transfer(gateAddress, value);
  await token.transferFromGate();
}

export async function deployDevGolemContracts(provider: Provider,
  deployWallet: Wallet,
  holderWallet: Wallet,
  logger: Logger = new ConsoleLogger()
): Promise<GolemContractsDevDeployment> {
  logger.log('Deploying Old Golem Network Token...');
  const {token: oldToken, holderSignedToken} = await deployOldToken(provider, deployWallet, holderWallet);
  logger.log(`Old Golem Network Token address: ${oldToken.address}`);
  logger.log('Deploying New Golem Network Token...');
  const newToken = await new NewGolemNetworkTokenFactory(deployWallet).deploy();
  logger.log(`New Golem Network Token address: ${newToken.address}`);
  const batchingToken = await new GolemNetworkTokenBatchingFactory(holderWallet).deploy(oldToken.address);
  await transferGNTB(holderWallet, batchingToken, holderSignedToken, parseUnits('10000000').toString());
  logger.log(`Golem Network Token Batching address: ${batchingToken.address}`);
  logger.log('Setting new token as migration agent');
  await oldToken.setMigrationAgent(newToken.address);
  logger.log('Migration agent set');
  logger.log(`Dev account: ${holderWallet.address} - ${holderWallet.privateKey}`);
  return {
    oldGolemTokenContractAddress: oldToken.address,
    newGolemTokenContractAddress: newToken.address,
    batchingGolemTokenContractAddress: batchingToken.address
  };
}
