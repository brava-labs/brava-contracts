const { spawn } = require('child_process');

const hardhatNode = spawn('npx', ['hardhat', 'node', '--hostname', '0.0.0.0']);

hardhatNode.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

hardhatNode.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

hardhatNode.on('close', (code) => {
  console.log(`child process exited with code ${code}`);
});