/**
 * FlagsHelper is a utility class that provides methods to manage feature flags in the application.
 * It allows to add bits to a flags number, check if a flag is set, and remove flags.
 **/
class FlagsHelper {
  static addFlags(flags: number, ...bits: number[]): number {
    return bits.reduce((acc, bit) => acc | bit, flags);
  }

  static hasFlag(flags: number, bit: number): boolean {
    return (flags & bit) === bit;
  }

  static removeFlags(flags: number, ...bits: number[]): number {
    return bits.reduce((acc, bit) => acc & ~bit, flags);
  }

  static toggleFlag(flags: number, bit: number): number {
    return flags ^ bit;
  }

  static isEmpty(flags: number): boolean {
    return flags === 0;
  }

  static toEnum(flags: number, enumType: Record<string, number>): string[] {
    return Object.entries(enumType)
      .filter(([_, value]) => (flags & value) === value)
      .map(([key]) => key);
  }

  static fromEnum(flags: number, enumType: Record<string, number>): number {
    return Object.entries(enumType).reduce(
      (acc, [_key, value]) => acc | (flags & value ? value : 0),
      0,
    );
  }
}

export default FlagsHelper;

// Usage example:
// import FlagsHelper from './FlagsHelper';
// const flags = FlagsHelper.addFlags(0, ChatFlags.ARCHIVED, ChatFlags.PUBLIC);
// const isArchived = FlagsHelper.hasFlag(flags, ChatFlags.ARCHIVED);
// const updatedFlags = FlagsHelper.removeFlags(flags, ChatFlags.PUBLIC);
// const toggledFlags = FlagsHelper.toggleFlag(flags, ChatFlags.ARCHIVED);
