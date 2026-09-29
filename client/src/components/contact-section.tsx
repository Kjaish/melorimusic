import { Mail, Send, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { newsletterSchema, type NewsletterSubscription } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export function ContactSection() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  const form = useForm<NewsletterSubscription>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: {
      email: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: NewsletterSubscription) => {
      const response = await apiRequest("POST", "/api/newsletter", data);
      return response.json();
    },
    onSuccess: () => {
      setIsSubscribed(true);
      form.reset();
      toast({
        title: "Subscribed!",
        description: "You'll receive updates on new releases and tour dates.",
      });
    },
    onError: () => {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: NewsletterSubscription) => {
    mutation.mutate(data);
  };

  return (
    <section id="contact" className="py-16 md:py-24 bg-background">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <div className="mb-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <h2
            className="font-heading text-3xl md:text-4xl font-bold mb-4"
            data-testid="text-contact-title"
          >
            Stay Connected
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto" data-testid="text-contact-description">
            Be the first to know about new releases, exclusive content, and upcoming tour dates.
          </p>
        </div>

        <Card className="p-6 md:p-8 bg-card border-card-border">
          {isSubscribed ? (
            <div className="flex flex-col items-center gap-4 py-4" data-testid="newsletter-success">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <div>
                <h3 className="font-heading font-semibold text-xl mb-2">
                  You're on the list!
                </h3>
                <p className="text-muted-foreground">
                  Thanks for subscribing. Check your inbox for a confirmation.
                </p>
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col sm:flex-row gap-3">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="Enter your email"
                          data-testid="input-newsletter-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="rounded-full px-6 gap-2"
                  disabled={mutation.isPending}
                  data-testid="button-newsletter-submit"
                >
                  {mutation.isPending ? (
                    "Subscribing..."
                  ) : (
                    <>
                      Subscribe
                      <Send className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            </Form>
          )}
        </Card>

        <p className="text-sm text-muted-foreground mt-4" data-testid="text-social-proof">
          Join 10,000+ fans who never miss an update
        </p>
      </div>
    </section>
  );
}
