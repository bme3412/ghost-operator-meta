import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

type ButtonProps = {
  children: ReactNode
  variant?: 'default' | 'primary'
  ref?: Ref<HTMLButtonElement>
} & ButtonHTMLAttributes<HTMLButtonElement>

export function Button({ children, variant = 'default', ref, ...rest }: ButtonProps): ReactNode {
  const className = variant === 'primary' ? 'btn btn-primary' : 'btn'
  return (
    <button type="button" className={className} ref={ref} {...rest}>
      {children}
    </button>
  )
}
