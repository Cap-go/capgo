export interface Customer {
  id: string
  stripe_customer_id: string
}

export interface JwtUser {
  sub: string
  email?: string
  role: 'anon' | 'authenticated'
}
