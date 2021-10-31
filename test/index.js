const Redis = require('ioredis');

const { spy } = require('sinon');
const { expect } = require('chai');
const { setTimeout } = require('timers/promises');
const { name: pdel, lua, numberOfKeys } = require('redis-pdel');

const Clusterix = require('..');

describe('clusterix', () => {
  let clusterInstances;

  const interval = 100;
  const pollInterval = interval;
  const heartbeatInterval = interval;
  const timeout = interval * 2;
  const redis = new Redis({ keyPrefix: 'clusterix:test:' });

  redis.defineCommand(pdel, { lua, numberOfKeys });

  const initializeTestNodes = (count = 3) => [...Array(count).keys()].map(
    (i) => {
      const node = new Clusterix(redis, {
        pollInterval,
        timeout,
        heartbeatInterval,
        nodeId: `node${i + 1}`,
      });

      return node.initializeNode().then(() => node);
    },
  );

  beforeEach(() => redis.pdel('*'));
  afterEach(() => clusterInstances.forEach((cluster) => cluster.dispose()));
  after(() => redis.disconnect());

  it('should properly create cluster of 3 nodes', async () => {
    clusterInstances = await Promise.all(initializeTestNodes());

    return clusterInstances.map((cluster) => expect(cluster.nodes).to.become([
      'node1',
      'node2',
      'node3',
    ]));
  });

  it('should throw when initializing two nodes with the same id', async () => {
    clusterInstances = await Promise.all(initializeTestNodes());

    return expect(new Clusterix(redis, {
      pollInterval,
      timeout,
      heartbeatInterval,
      nodeId: 'node1',
    }).initializeNode()).to.be.rejectedWith(Error, 'Duplicate node sending heartbeats');
  });

  it('should detect node down while initializing', async () => {
    const node = new Clusterix(redis, {
      pollInterval,
      timeout,
      heartbeatInterval,
      nodeId: 'node1',
    });
    await node.initializeNode();
    node.dispose();

    const onNodeDown = spy();
    const node2 = new Clusterix(redis, {
      pollInterval,
      timeout,
      heartbeatInterval,
      nodeId: 'node1',
    });
    node2.on('node down', onNodeDown);
    await node2.initializeNode();
    expect(onNodeDown).to.have.been.calledOnceWithExactly('node1');
    node2.dispose();
  });

  it('should detect dead node', async () => {
    const node = 'node3';
    const nodeDown = spy();
    clusterInstances = await Promise.all(initializeTestNodes());
    clusterInstances[0].on('node down', nodeDown);
    clusterInstances[1].on('node down', nodeDown);
    clusterInstances[2].dispose();

    await setTimeout(timeout * 2);

    expect(nodeDown).to.have.been.calledOnceWithExactly(node);

    return clusterInstances.map((cluster) => expect(cluster.nodes).to.become([
      'node1',
      'node2',
    ]));
  });
});
