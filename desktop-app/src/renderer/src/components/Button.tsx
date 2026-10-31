import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = {
  children: ReactNode
  variant?: 'default' | 'primary'
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ children, variant = 'default', ...rest }: ButtonProps): ReactNode {
  const className = variant === 'primary' ? 'btn btn-primary' : 'btn'
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  )
}
