#!/usr/bin/env node
import { verifyWrapper } from '../hooks/lib/wrapper.js';

verifyWrapper((msg) => process.stderr.write(msg + '\n'));