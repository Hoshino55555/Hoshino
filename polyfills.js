import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import process from 'process/browser';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (global.process) {
  for (const key of Object.keys(process)) {
    if (global.process[key] === undefined) {
      global.process[key] = process[key];
    }
  }
} else {
  global.process = process;
}
