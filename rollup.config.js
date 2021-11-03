import babel from '@rollup/plugin-babel';
import builtins from 'builtin-modules';

const input = 'src/index.js';
const plugins = [babel({ babelHelpers: 'bundled' })];

export default [{
  external: builtins,
  input,
  // sourcemaps help generate coverage reports for the actual sources using istanbul
  output: {
    file: 'dist/index.cjs',
    format: 'cjs',
    sourcemap: true,
    exports: 'default',
  },
  plugins,
}, {
  external: builtins,
  input,
  output: {
    file: 'dist/index.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins,
}];
