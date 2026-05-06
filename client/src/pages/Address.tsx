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

const phoneAllowed = /^[+\d\s().\-]+$/;

const schema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name required")
    .max(40, "Too long"),
  lastInitial: z
    .string()
    .trim()
    .min(1, "Last initial required")
    .max(8, "Just an initial or short last name"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone required")
    .refine((v) => phoneAllowed.test(v), "Use digits, spaces, +, -, ()")
    .refine(
      (v) => (v.match(/\d/g) || []).length >= 7,
      "Enter at least 7 digits",
    ),
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
      firstName: address?.firstName ?? "",
      lastInitial: address?.lastInitial ?? "",
      phone: address?.phone ?? "",
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
    <Shell title="Delivery details" back="/cart" showCart={false}>
      <p className="text-sm text-muted-foreground mb-5">
        We use these details for this order only. PuffGo does not save customer
        profiles across orders. The driver may text or call before arrival.
      </p>

      <div className="mb-5 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-100/90">
        <span className="font-semibold text-amber-200">Delivery area notice:</span>{" "}
        Pasco County orders are the normal service area. If this address is outside Pasco,
        add a larger tip or wait for the operator to confirm before expecting dispatch.
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="First name" error={errors.firstName?.message}>
            <Input
              {...register("firstName")}
              className="bg-card border-card-border"
              placeholder="Alex"
              autoComplete="given-name"
              data-testid="input-first-name"
            />
          </Field>
          <Field label="Last initial" error={errors.lastInitial?.message}>
            <Input
              {...register("lastInitial")}
              className="bg-card border-card-border"
              placeholder="R"
              autoComplete="family-name"
              maxLength={8}
              data-testid="input-last-initial"
            />
          </Field>
        </div>
        <Field label="Phone number" error={errors.phone?.message}>
          <Input
            {...register("phone")}
            className="bg-card border-card-border"
            placeholder="(555) 555-5555"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            data-testid="input-phone"
          />
        </Field>
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
