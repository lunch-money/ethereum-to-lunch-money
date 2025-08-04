import dotenv from 'dotenv';
import { exec } from 'child_process';

dotenv.config(); // Load environment variables from .env

const scenarios = [
  {
    description: 'Test with valid Alchemy and Infura keys',
    env: {
      ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
      INFURA_API_KEY: process.env.INFURA_API_KEY,
    },
    expected: { true: 'success', false: 'success' },
  },
  {
    description: 'Test with old Pocket API key',
    env: {
      POCKET_API_KEY: 'old_key',
    },
    expected: { true: 'fail', false: 'success' },
  },
  {
    description: 'Test with valid Etherscan and Moralis keys',
    env: {
      ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY,
      MORALIS_API_KEY: process.env.MORALIS_API_KEY,
    },
    expected: { true: 'success', false: 'success' },
  },
  {
    description: 'Test with invalid Etherscan and Moralis keys',
    env: {
      ETHERSCAN_API_KEY: 'invalid_key',
      MORALIS_API_KEY: 'invalid_key',
    },
    expected: { true: 'fail', false: 'success' },
  },
  {
    description: 'Test with valid Alchemy key but invalid Infura key',
    env: {
      ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY,
      INFURA_API_KEY: 'invalid_key',
    },
    expected: { true: 'fail', false: 'success' },
  },
  {
    description: 'Test with valid Infura key but invalid Alchemy key',
    env: {
      ALCHEMY_API_KEY: 'invalid_key',
      INFURA_API_KEY: process.env.INFURA_API_KEY,
    },
    expected: { true: 'fail', false: 'success' },
  },
];

function runTest(scenario, failOnError) {
  return new Promise((resolve) => {
    const env = { ...process.env, ...scenario.env, DEBUG_ETHEREUM_FAIL_ON_ERROR: failOnError.toString() };
    const command = 'npm run test-live';
    const options = { env };

    console.log(`Running: ${scenario.description} with DEBUG_ETHEREUM_FAIL_ON_ERROR=${failOnError}`);
    exec(command, options, (error, stdout, stderr) => {
      const result = {
        description: scenario.description,
        expected: scenario.expected[failOnError],
        actual: error ? 'fail' : 'success',
        output: stdout,
        error: stderr,
        failOnError,
      };

      if (error) {
        console.error(`Error: ${error.message}`);
        return resolve(result);
      }
      if (stderr) {
        console.error(`Stderr: ${stderr}`);
      }
      console.log(`Output:\n${stdout}`);
      resolve(result);
    });
  });
}

async function runAllTests() {
  const results = [];
  for (const failOnError of [true, false]) {
    for (const scenario of scenarios) {
      try {
        const result = await runTest(scenario, failOnError);
        results.push(result);
      } catch (error) {
        console.error(`Test failed for scenario: ${scenario.description}`);
      }
    }
  }

  // Analyze results and provide a succinct report
  console.log('\nTest Results Report:');
  results.forEach((result) => {
    const status = result.expected === result.actual ? 'PASS' : 'FAIL';
    console.log(`- ${result.description} with DEBUG_ETHEREUM_FAIL_ON_ERROR=${result.failOnError}: ${status}`);
    console.log(`  Expected: ${result.expected}, Actual: ${result.actual}`);
  });
}

runAllTests();