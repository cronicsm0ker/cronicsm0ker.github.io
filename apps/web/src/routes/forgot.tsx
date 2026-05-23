import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const Route = createFileRoute('/forgot')({
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await apiClient.forgotPassword({ email });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            We'll email a reset link to the address on file if it matches an account.
          </CardDescription>
        </CardHeader>
        {submitted ? (
          <CardContent>
            <p className="text-sm text-neutral-700">
              If that email is registered, a reset link is on its way. Check your inbox.
            </p>
            <div className="mt-4">
              <Link to="/login" className="text-sm text-brand-600 hover:underline">
                Back to sign in
              </Link>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={onSubmit}>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" loading={loading} className="w-full">
                Send reset link
              </Button>
              <Link to="/login" className="text-sm text-neutral-600 hover:underline">
                Back to sign in
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
