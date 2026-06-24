import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/app/lib/supabase'

// GET ?event_id=X  — compute all overhead allocations for an event
// Supports 4 allocation models: fixed_pct, revenue_pct, headcount_pct, manual

export async function GET(req: NextRequest) {
  const event_id = new URL(req.url).searchParams.get('event_id')
  if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  // 1. Get allocation rules for this event
  const { data: allocations } = await supabaseAdmin
    .from('overhead_event_allocations')
    .select('component, allocation_model, allocation_value, manual_amount')
    .eq('event_id', event_id)

  if (!allocations || allocations.length === 0) {
    return NextResponse.json({ components: [], total_overhead: 0 })
  }

  // 2. Get overhead config (last 12 months of cost pools)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  const startMonth = twelveMonthsAgo.toISOString().substring(0, 10)

  const { data: configs } = await supabaseAdmin
    .from('overhead_config')
    .select('component, period_month, monthly_cost, currency')
    .gte('period_month', startMonth)

  const configMap: Record<string, Array<{ month: string; cost: number }>> = {}
  for (const c of configs || []) {
    if (!configMap[c.component]) configMap[c.component] = []
    configMap[c.component].push({ month: c.period_month, cost: Number(c.monthly_cost) })
  }

  // 3. Get event's confirmed revenue (for revenue_pct model)
  const { data: deals } = await supabaseAdmin
    .from('event_deals')
    .select('converted_amount')
    .eq('event_id', event_id)
    .eq('status', 'confirmed')

  const confirmedRevenue = (deals || []).reduce((sum, d) => sum + Number(d.converted_amount || 0), 0)

  // 4. Get event staff count (for headcount_pct model)
  const { count: eventStaffCount } = await supabaseAdmin
    .from('event_staff')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event_id)

  const { count: totalStaffCount } = await supabaseAdmin
    .from('staff_members')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)

  // 5. Calculate allocation per component
  const components: Array<{
    component: string
    model: string
    rate: number
    monthly_pool: number
    allocated: number
  }> = []

  let totalOverhead = 0

  for (const alloc of allocations) {
    const monthlyPools = configMap[alloc.component] || []
    const totalPool = monthlyPools.reduce((s, m) => s + m.cost, 0)
    let allocated = 0

    switch (alloc.allocation_model) {
      case 'fixed_pct':
        // allocation_value% of total cost pool
        allocated = (totalPool * Number(alloc.allocation_value)) / 100
        break

      case 'revenue_pct':
        // allocation_value% of confirmed revenue
        allocated = (confirmedRevenue * Number(alloc.allocation_value)) / 100
        break

      case 'headcount_pct':
        // (event staff / total staff) * total cost pool
        if (totalStaffCount && totalStaffCount > 0) {
          allocated = ((eventStaffCount || 0) / totalStaffCount) * totalPool
        }
        break

      case 'manual':
        allocated = Number(alloc.manual_amount) || 0
        break
    }

    allocated = Math.round(allocated * 100) / 100

    components.push({
      component: alloc.component,
      model: alloc.allocation_model,
      rate: Number(alloc.allocation_value),
      monthly_pool: totalPool,
      allocated,
    })

    totalOverhead += allocated
  }

  // 6. Also fetch existing Finance + HR overhead from their dedicated engines
  const financeRes = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'}/api/finance/allocation?event_id=${event_id}`
  ).then(r => r.json()).catch(() => ({ allocated_cost: 0 }))

  const hrRes = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3003'}/api/hr/allocation?event_id=${event_id}`
  ).then(r => r.json()).catch(() => ({ allocated_cost: 0 }))

  const financeOverhead = Number(financeRes.allocated_cost) || 0
  const hrOverhead = Number(hrRes.allocated_cost) || 0

  return NextResponse.json({
    components,
    finance_overhead: financeOverhead,
    hr_overhead: hrOverhead,
    custom_overhead: Math.round(totalOverhead * 100) / 100,
    total_overhead: Math.round((totalOverhead + financeOverhead + hrOverhead) * 100) / 100,
  })
}
