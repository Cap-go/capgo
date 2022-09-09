import { assertEquals } from 'https://deno.land/std@0.155.0/testing/asserts.ts'

Deno.test('url test', () => {
  const url = new URL('./foo.js', 'https://deno.land/')
  assertEquals(url.href, 'https://deno.land/foo.js')
})
