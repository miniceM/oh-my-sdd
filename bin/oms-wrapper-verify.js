#!/usr/bin/env node
import { verifyWrapper } from '../wrapper/wrapper.js';

verifyWrapper((msg) => process.stderr.write(msg + '\n'));