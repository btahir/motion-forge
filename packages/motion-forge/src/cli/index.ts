#!/usr/bin/env node
import { nodeHost, runCLI } from './main';
runCLI(process.argv.slice(2), nodeHost).then(code => { process.exitCode = code; });
