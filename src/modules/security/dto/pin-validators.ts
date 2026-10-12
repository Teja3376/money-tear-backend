import {
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const PIN_PATTERN = /^[0-9]{4}$/;

@ValidatorConstraint({ name: 'isPin' })
class IsPin implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && PIN_PATTERN.test(value);
  }
  defaultMessage(): string {
    return 'must be exactly 4 digits';
  }
}

@ValidatorConstraint({ name: 'matchesField' })
class MatchesField implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [field] = args.constraints;
    return (args.object as Record<string, unknown>)[field] === value;
  }
  defaultMessage(args: ValidationArguments): string {
    return `must match ${args.constraints[0]}`;
  }
}

const pin = () => Validate(IsPin);

export { pin, MatchesField };
