import { Shell, StickyFooter, Disclaimer } from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCart } from "@/lib/cart-context";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  street: z.string().min(2, "Street required"),
  unit: z.string().optional(),
  city: z.string().min(1, "City required"),
  state: z.string().min(2, "State required").max(2, "Use 2-letter state"),
  zip: z.string().min(5, "Zip required").max(10),
  notes: z.string().optional(),
});

type FormVals = z.infer<typeof schema>;

export default function Address() {
  const { setAddress, address } = useCart();
  const [, navigate] = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormVals>({
    resolver: zodResolver(schema),
    defaultValues: {
      street: address?.street ?? "",
      unit: address?.unit ?? "",
      city: address?.city ?? "",
      state: address?.state ?? "",
      zip: address?.zip ?? "",
      notes: address?.notes ?? "",
    },
  });

  function onSubmit(vals: FormVals) {
    setAddress(vals);
    navigate("/tip");
  }

  return (
    <Shell title="Delivery address" back="/cart" showCart={false}>
      <p className="text-sm text-muted-foreground mb-5">
        We use this address for this order only. PuffGo does not save customer
        profiles or addresses across orders.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Street address" error={errors.street?.message}>
          <Input
            {...register("street")}
            className="bg-card border-card-border"
            placeholder="123 Smoke Ln"
            autoComplete="off"
            data-testid="input-street"
          />
        </Field>
        <Field label="Apt / Unit (optional)">
          <Input
            {...register("unit")}
            className="bg-card border-card-border"
            placeholder="Apt 4B"
            autoComplete="off"
            data-testid="input-unit"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="City" error={errors.city?.message}>
              <Input
                {...register("city")}
                className="bg-card border-card-border"
                autoComplete="off"
                data-testid="input-city"
              />
            </Field>
          </div>
          <Field label="State" error={errors.state?.message}>
            <Input
              {...register("state")}
              className="bg-card border-card-border uppercase"
              maxLength={2}
              autoComplete="off"
              data-testid="input-state"
            />
          </Field>
        </div>
        <Field label="ZIP" error={errors.zip?.message}>
          <Input
            {...register("zip")}
            className="bg-card border-card-border"
            inputMode="numeric"
            autoComplete="off"
            data-testid="input-zip"
          />
        </Field>
        <Field label="Driver notes (optional)">
          <Textarea
            {...register("notes")}
            className="bg-card border-card-border min-h-20"
            placeholder="Gate code, where to meet, etc."
            data-testid="input-notes"
          />
        </Field>

        <Disclaimer />

        <StickyFooter>
          <Button
            type="submit"
            className="ember-button w-full h-12 font-semibold"
            data-testid="button-continue-tip"
          >
            Continue to tip
          </Button>
        </StickyFooter>
      </form>
    </Shell>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {error && (
        <p className="text-xs text-destructive mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
