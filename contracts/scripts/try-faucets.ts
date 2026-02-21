import { ethers } from 'ethers'
import 'dotenv/config'

// Try multiple testnets to find one we can get funded on
const TESTNETS = [
  {
    name: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    chainId: 84532,
    explorer: 'https://sepolia.basescan.org',
    faucets: ['https://www.alchemy.com/faucets/base-sepolia', 'https://faucet.quicknode.com/base/sepolia'],
  },
  {
    name: 'Sepolia',
    rpc: 'https://rpc.sepolia.org',
    chainId: 11155111,
    explorer: 'https://sepolia.etherscan.io',
    faucets: ['https://sepoliafaucet.com', 'https://faucet.sepolia.dev'],
  },
  {
    name: 'Holesky',
    rpc: 'https://ethereum-holesky.publicnode.com',
    chainId: 17000,
    explorer: 'https://holesky.etherscan.io',
    faucets: ['https://cloud.google.com/application/web3/faucet/ethereum/holesky'],
  },
]

async function check() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk) {
    console.log('No DEPLOYER_PRIVATE_KEY set')
    return
  }
  const wallet = new ethers.Wallet(pk)
  console.log(`Wallet: ${wallet.address}\n`)

  for (const net of TESTNETS) {
    try {
      const provider = new ethers.JsonRpcProvider(net.rpc, net.chainId)
      const balance = await provider.getBalance(wallet.address)
      const eth = ethers.formatEther(balance)
      const status = balance > 0n ? 'FUNDED' : 'empty'
      console.log(`[${net.name}] Balance: ${eth} ETH  (${status})`)
      if (balance === 0n) {
        console.log(`  Fund at: ${net.faucets[0]}`)
      } else {
        console.log(`  Explorer: ${net.explorer}/address/${wallet.address}`)
      }
    } catch (e: any) {
      console.log(`[${net.name}] RPC error: ${e.message?.slice(0, 60)}`)
    }
  }
}

check()
