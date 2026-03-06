import dotenv from 'dotenv'
dotenv.config({ path: '.env.test' })

import { createClient } from '@supabase/supabase-js'

// 使用 Vercel 环境变量中配置的值
const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_ANON_KEY || ''

console.log('Testing Supabase connection...')
console.log('URL:', supabaseUrl)
console.log('Key length:', supabaseKey.length)

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.test')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  try {
    const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true })
    
    if (error) {
      console.error('Connection failed:', error.message)
    } else {
      console.log('Connection successful! User count:', data)
    }
  } catch (err: any) {
    console.error('Unexpected error:', err.message)
  }
}

testConnection()
