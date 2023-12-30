type Primitive = string | number | boolean | bigint | symbol | null | undefined
type Expand<T> = T extends Primitive ? T : { [K in keyof T]: T[K] }

type OptionalKeys<T> = {
  [K in keyof T]-?: T extends Record<K, T[K]> ? never : K;
}[keyof T]

type RequiredKeys<T> = {
  [K in keyof T]-?: T extends Record<K, T[K]> ? K : never;
}[keyof T] &
keyof T

type RequiredMergeKeys<T, U> = RequiredKeys<T> & RequiredKeys<U>

type OptionalMergeKeys<T, U> =
    | OptionalKeys<T>
    | OptionalKeys<U>
    | Exclude<RequiredKeys<T>, RequiredKeys<U>>
    | Exclude<RequiredKeys<U>, RequiredKeys<T>>

type MergeNonUnionObjects<T, U> = Expand<
    {
      [K in RequiredMergeKeys<T, U>]: Expand<Merge<T[K], U[K]>>;
    } & {
      [K in OptionalMergeKeys<T, U>]?: K extends keyof T
        ? K extends keyof U
          ? Expand<Merge<
                    Exclude<T[K], undefined>,
                    Exclude<U[K], undefined>
                >>
          : T[K]
        : K extends keyof U
          ? U[K]
          : never;
    }
>

type MergeNonUnionArrays<T extends readonly any[], U extends readonly any[]> = Array<Expand<Merge<T[number], U[number]>>>

type MergeArrays<T extends readonly any[], U extends readonly any[]> = [T] extends [never]
  ? U extends any
    ? MergeNonUnionArrays<T, U>
    : never
  : [U] extends [never]
      ? T extends any
        ? MergeNonUnionArrays<T, U>
        : never
      : T extends any
        ? U extends any
          ? MergeNonUnionArrays<T, U>
          : never
        : never

type MergeObjects<T, U> = [T] extends [never]
  ? U extends any
    ? MergeNonUnionObjects<T, U>
    : never
  : [U] extends [never]
      ? T extends any
        ? MergeNonUnionObjects<T, U>
        : never
      : T extends any
        ? U extends any
          ? MergeNonUnionObjects<T, U>
          : never
        : never

export type Merge<T, U> =
    | Extract<T | U, Primitive>
    | MergeArrays<Extract<T, readonly any[]>, Extract<U, readonly any[]>>
    | MergeObjects<Exclude<T, Primitive | readonly any[]>, Exclude<U, Primitive | readonly any[]>>

export type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never

export type Concrete<Type> = {
  [Property in keyof Type]-?: Type[Property];
}
