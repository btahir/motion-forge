import { main } from './main';

main(process.argv.slice(2)).then(code => {
  if (code !== undefined) process.exitCode = code;
});
