import * as fs from 'fs'
import * as path from 'path'

const solc = require('solc')

const CONTRACTS_DIR = path.join(__dirname, '..', 'src')
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts')

function compile() {
  const solPath = path.join(CONTRACTS_DIR, 'ClawGuild.sol')
  const source = fs.readFileSync(solPath, 'utf8')

  const input = {
    language: 'Solidity',
    sources: {
      'ClawGuild.sol': { content: source },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  }

  console.log('[Compile] Compiling ClawGuild.sol ...')
  const output = JSON.parse(solc.compile(JSON.stringify(input)))

  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === 'error')
    if (fatal.length > 0) {
      console.error('[Compile] Errors:')
      fatal.forEach((e: any) => console.error(e.formattedMessage))
      process.exit(1)
    }
    // Print warnings
    output.errors
      .filter((e: any) => e.severity === 'warning')
      .forEach((e: any) => console.warn('[Compile] Warning:', e.message))
  }

  const contract = output.contracts['ClawGuild.sol']['ClawGuild']
  const artifact = {
    contractName: 'ClawGuild',
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object,
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })
  const outPath = path.join(ARTIFACTS_DIR, 'ClawGuild.json')
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2))

  console.log(`[Compile] ABI: ${artifact.abi.length} functions/events`)
  console.log(`[Compile] Bytecode: ${artifact.bytecode.length} chars`)
  console.log(`[Compile] Artifact written to ${outPath}`)
}

compile()
