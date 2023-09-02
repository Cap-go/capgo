import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'
import { oldUpdate } from '../_utils/update.ts'

serve(oldUpdate)
