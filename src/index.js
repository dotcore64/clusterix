const { EventEmitter } = require('events');
const { hostname } = require('os');
const { readFileSync } = require('fs');
const { join } = require('path');
const { setTimeout } = require('timers/promises');

const defaultNodeId = () => `${hostname()}:${process.env.PORT}`;
const lua = readFileSync(join(__dirname, './poll.lua'), 'utf8');

module.exports = class extends EventEmitter {
  #id

  get id() {
    return this.#id;
  }

  #nodeId

  get nodeId() {
    return this.#nodeId;
  }

  #heartbeatInterval

  get heartbeatInterval() {
    return this.#heartbeatInterval;
  }

  #pollInterval

  get pollInterval() {
    return this.#pollInterval;
  }

  #timeout

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
          this.emit('node down', this.nodeId);
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

  #redisKey = (key) => ((typeof this.id === 'string' && this.id.length)
    ? `${this.id}:${key}`
    : key);

  #lastTimestamp = () => (
    this.redis.hget(this.#redisKey('heartbeats'), this.nodeId)
  )

  #heartbeat = (timestamp = Date.now()) => (
    this.redis.hset(this.#redisKey('heartbeats'), this.nodeId, timestamp)
  )

  #poll = () => (
    this.redis.__clusterix__poll( // eslint-disable-line no-underscore-dangle
      this.#redisKey('heartbeats'),
      Date.now(),
      this.timeout,
    ).then((nodes) => nodes.map((nodeid) => this.emit('node down', nodeid)))
  )
};
