
import { getMemoryStore } from './src/modules/memory/rag.js';

const store = getMemoryStore();

// Warm up
store.add('test', 'The quick brown fox jumps over the lazy dog');
store.add('test', 'JavaScript is a versatile programming language');

const query = 'brown fox';

console.time('First search (cold)');
const res1 = store.search(query);
console.timeEnd('First search (cold)');

console.time('Second search (cached)');
const res2 = store.search(query);
console.timeEnd('Second search (cached)');

if (JSON.stringify(res1) === JSON.stringify(res2)) {
    console.log('✅ Cache results match');
} else {
    console.error('❌ Cache results mismatch');
    process.exit(1);
}

store.add('test', 'Another memory to invalidate cache');
console.time('Third search (after invalidation)');
const res3 = store.search(query);
console.timeEnd('Third search (after invalidation)');
