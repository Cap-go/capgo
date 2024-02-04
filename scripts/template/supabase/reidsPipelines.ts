// import from here
class RedisRedisPipeline implements RedisPipelineInterface {
  pipeline: RedisPipeline

  constructor(pipeline: RedisPipeline) {
    this.pipeline = pipeline
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.pipeline.hdel(key, ...fields)
  }

  async flush(): Promise<void> {
    await this.pipeline.flush()
  }

  async hset(key: string, field: string, value: RedisValue): Promise<void> {
    await this.pipeline.hset(key, field, value)
  }
}

class RedisUpstashPipeline implements RedisPipelineInterface {
  size: number
  pipeline: UpstashPipeline<[]>

  constructor(pipeline: UpstashPipeline<[]>) {
    this.pipeline = pipeline
    this.size = 0
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    await this.pipeline.hdel(key, ...fields)
    this.size++
    return 0
  }

  async flush(): Promise<void> {
    if (this.size === 0)
      return
    await this.pipeline.exec()
  }

  async hset(key: string, field: string, value: RedisValue): Promise<void> {
    const object: { [field: string]: RedisValue } = {}
    object[field] = value
    await this.pipeline.hset(key, object)
    this.size++
  }
}

export class RedisRedis implements RedisInterface {
  redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.redis.hdel(key, ...fields)
  }

  pipeline(): RedisPipelineInterface {
    return new RedisRedisPipeline(this.redis.pipeline())
  }

  tx(): RedisPipelineInterface {
    return new RedisRedisPipeline(this.redis.tx())
  }

  async hscan(key: string, cursor: number, opts?: { pattern: string; count: number }): Promise<[string, string[]]> {
    return await this.redis.hscan(key, cursor, opts)
  }

  async hset(key: string, field: string, value: RedisValue) {
    await this.redis.hset(key, field, value)
  }

  async hmget(key: string, ...fields: string[]): Promise<(string | null | undefined)[]> {
    return await this.redis.hmget(key, ...fields)
  }
}

export class RedisUpstashImpl implements RedisInterface {
  redis: RedisUpstash

  constructor(redis: RedisUpstash) {
    this.redis = redis
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return await this.redis.hdel(key, ...fields)
  }

  async hscan(key: string, cursor: number, opts?: { pattern: string; count: number }): Promise<[string, string[]]> {
    const [resultCursor, result] = await this.redis.hscan(
      key,
      cursor,
      (opts) ? { match: opts.pattern, count: opts.count } : undefined,
    )

    return [resultCursor.toString(), result.map(res => res.toString())]
  }

  async hset(key: string, field: string, value: RedisValue) {
    await this.redis.hset(key, {
      [field]: value,
    })
  }

  async hmget(key: string, ...fields: string[]): Promise<(string | undefined)[]> {
    const res = await this.redis.hmget(key, ...fields)

    if (!res)
      return []

    return Object.values(res).map((data) => {
      if (!data)
        return undefined

      return data as string
    })
  }

  pipeline(): RedisPipelineInterface {
    return new RedisUpstashPipeline(this.redis.pipeline())
  }

  tx = this.pipeline
}