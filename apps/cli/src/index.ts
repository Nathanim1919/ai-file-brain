#!/usr/bin/env node

import {Command} from "commander";
import { handleScan } from "./commands/scan"
import { handleFind } from "./commands/find"
import { handleOrganize } from "./commands/organize"
import { handleAsk } from "./commands/ask"
import { handleStats } from "./commands/stats"


const program = new Command();



program
    .name('ai')
    .description('Local AI-powered file assistant')
    .version('1.0.0');


program
    .command('scan')
    .description('Scan and index files')
    .action(handleScan);


program
    .command('find <query>')
    .description('Find files')
    .action(handleFind);


program
    .command('organize <folder>')
    .description('Organize files in folders')
    .action(handleOrganize);


program
    .command('ask <query>')
    .description('Ask AI about files')
    .action(handleAsk);


program
    .command('stats')
    .description('Show stats')
    .action(handleStats);


program.parse();
