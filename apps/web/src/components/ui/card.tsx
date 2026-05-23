import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type CardProps = HTMLAttributes<HTMLDivElement>;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-xl border border-neutral-200 bg-white shadow-sm',
        className,
      )}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, CardProps>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('p-6 pb-4', className)} {...props} />;
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h2
        ref={ref}
        className={cn('text-lg font-semibold text-neutral-900', className)}
        {...props}
      />
    );
  },
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cn('text-sm text-neutral-600 mt-1', className)} {...props} />
    );
  },
);

export const CardContent = forwardRef<HTMLDivElement, CardProps>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('p-6 pt-2', className)} {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, CardProps>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('p-6 pt-4 flex items-center', className)} {...props} />;
});
