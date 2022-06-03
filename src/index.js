import { EventEmitter } from 'node:events';
import { hostname } from 'node:os';
import { setTimeout } from 'node:timers/promises';
import { readFileSync } from 'fs'; // eslint-disable-line unicorn/prefer-node-protocol

const defaultNodeId = () => `${hostname()}:${process.env.PORT}`;
const lua = readFileSync(require.resolve('./poll.lua'), 'utf8'); // eslint-disable-line no-undef,unicorn/prefer-module

export default class extends EventEmitter {
  #id;

  get id() {
    return this.#id;
  }

  #nodeId;

  get nodeId() {
    return this.#nodeId;
  }

  #heartbeatInterval;

  get heartbeatInterval() {
    return this.#heartbeatInterval;
  }

  #pollInterval;

  get pollInterval() {
    return this.#pollInterval;
  }

  #timeout;

  get timeout() {
    return this.#timeout;
  }

  constructor(redis, {
    id = null,
    nodeId = defaultNodeId(),
    heartbeatInterval = 500,
    pollInterval = 500,
    timeout = 1000,
  } = {}) {
    super();

    redis.defineCommand('__clusterix__poll', {
      numberOfKeys: 1,
      lua,
    });
    this.redis = redis;

    this.#id = id;
    this.#nodeId = nodeId;
    this.#heartbeatInterval = heartbeatInterval;
    this.#pollInterval = pollInterval;
    this.#timeout = timeout;
  }

  get nodes() {
    return this.redis.hkeys(this.#redisKey('heartbeats'));
  }

  initializeNode() {
    if (this.heartbeatInterval > this.timeout) throw new Error('Heartbeats should be more frequent than the timeout');

    const timestamp = Date.now();
    return this.#heartbeat(timestamp)
      .then(async (initialized) => {
        if (!initialized) {
          // Test if another node is sending heartbeats as this node
          await setTimeout(this.heartbeatInterval);
          if (await this.#lastTimestamp() > timestamp) {
            throw new Error('Duplicate node sending heartbeats');
          }

          // This node went down without proper cleanup
          this.#emitNodeDown();
        }

        this.heartbeatTimer = setInterval(this.#heartbeat, this.heartbeatInterval);
        this.pollTimer = setInterval(this.#poll, this.pollInterval);
      });
  }

  dispose() {
    clearTimeout(this.heartbeatTimer);
    clearTimeout(this.pollTimer);

    this.heartbeatTimer = null;
    this.pollTimer = null;
  }

  #redisKey = (key) => ((typeof this.id === 'string' && this.id.length > 0)
    ? `${this.id}:${key}`
    : key);

  #lastTimestamp = () => (
    this.redis.hget(this.#redisKey('heartbeats'), this.nodeId)
  );

  #heartbeat = (timestamp = Date.now()) => (
    this.redis.hset(this.#redisKey('heartbeats'), this.nodeId, timestamp)
  );

  #poll = () => (
    this.redis.__clusterix__poll( // eslint-disable-line no-underscore-dangle
      this.#redisKey('heartbeats'),
      Date.now(),
      this.timeout,
    ).then((nodes) => nodes.forEach(this.#emitNodeDown))
  );

  #emitNodeDown = (nodeId = this.nodeId) => this.emit('node down', nodeId);
}
