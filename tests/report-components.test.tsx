import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BarsChart } from '@/components/growly/bars-chart'
import { CashflowChart } from '@/components/growly/cashflow-chart'
import { ReportStat } from '@/components/growly/report-stat'
import { CategoryBars } from '@/components/growly/category-bars'
import { KpiCard } from '@/components/growly/kpi-card'

const series = [
  { year: 2026, month: 5, income: 100_000, expense: 50_000 },
  { year: 2026, month: 6, income: 200_000, expense: 100_000 },
]

describe('BarsChart', () => {
  it('altura proporcional al máximo y mes actual en negrita', () => {
    render(<BarsChart series={series} />)
    expect(screen.getByText('Ingresos vs Gastos')).toBeInTheDocument()
    expect(screen.getByTestId('bar-income-1')).toHaveStyle({ height: '100%' })
    expect(screen.getByTestId('bar-income-0')).toHaveStyle({ height: '50%' })
    expect(screen.getByTestId('bar-expense-1')).toHaveStyle({ height: '50%' })
    expect(screen.getByText('jul').className).toContain('font-extrabold')
    expect(screen.getByText('jun').className).not.toContain('font-extrabold')
  })
})

describe('CashflowChart', () => {
  it('polylines de ingresos y gastos con puntos escalados', () => {
    render(<CashflowChart series={series} />)
    expect(screen.getByText('Flujo de caja')).toBeInTheDocument()
    // max 200_000: ingresos [100k, 200k] → "0,110 640,20"; gastos [50k, 100k] → "0,155 640,110"
    expect(screen.getByTestId('cashflow-income')).toHaveAttribute('points', '0,110 640,20')
    expect(screen.getByTestId('cashflow-expense')).toHaveAttribute('points', '0,155 640,110')
  })
})

describe('ReportStat', () => {
  it('delta verde cuando es buena, roja cuando no; sin delta no renderiza línea', () => {
    const { rerender } = render(
      <ReportStat label="Tasa de ahorro" value="37%" delta={{ text: '+5 pts vs jun', good: true }} />,
    )
    expect(screen.getByText('37%')).toBeInTheDocument()
    expect(screen.getByText('+5 pts vs jun').className).toContain('text-acc')
    rerender(<ReportStat label="Gasto medio/día" value="$125" delta={{ text: '+$8 vs jun', good: false }} />)
    expect(screen.getByText('+$8 vs jun').className).toContain('text-destructive')
    rerender(<ReportStat label="Tasa de ahorro" value="0%" delta={null} />)
    expect(screen.queryByText(/vs /)).not.toBeInTheDocument()
  })
})

describe('CategoryBars', () => {
  it('barras proporcionales con el color de la categoría y vacío con mensaje', () => {
    const { rerender } = render(
      <CategoryBars
        items={[
          { id: 'c2', name: 'Casa', colorHex: '#10B981', total: 160_000 },
          { id: 'c1', name: 'Comida', colorHex: '#3B82F6', total: 80_000 },
        ]}
      />,
    )
    expect(screen.getByTestId('catbar-c2')).toHaveStyle({ width: '100%', backgroundColor: '#10B981' })
    expect(screen.getByTestId('catbar-c1')).toHaveStyle({ width: '50%', backgroundColor: '#3B82F6' })
    rerender(<CategoryBars items={[]} />)
    expect(screen.getByText('Sin gastos en este periodo.')).toBeInTheDocument()
  })
})

describe('KpiCard · delta', () => {
  it('renderiza el delta con el color según good', () => {
    const { rerender } = render(
      <KpiCard label="Ingresos" cents={612_000} accent="income" delta={{ text: '▲ 8% vs jun', good: true }} />,
    )
    expect(screen.getByText('▲ 8% vs jun').className).toContain('text-acc')
    rerender(
      <KpiCard label="Gastos" cents={388_000} accent="expense" delta={{ text: '▲ 4% vs jun', good: false }} />,
    )
    expect(screen.getByText('▲ 4% vs jun').className).toContain('text-destructive')
    rerender(<KpiCard label="Gastos" cents={388_000} accent="expense" delta={null} />)
    expect(screen.queryByText(/vs jun/)).not.toBeInTheDocument()
  })
})
