import { use } from 'chai';

// https://github.com/mysticatea/eslint-plugin-node/issues/250
use((await import('sinon-chai')).default); // eslint-disable-line node/no-unsupported-features/es-syntax
use((await import('chai-as-promised')).default); // eslint-disable-line node/no-unsupported-features/es-syntax
