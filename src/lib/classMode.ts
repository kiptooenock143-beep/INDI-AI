let classModeEnabled = false;

export const isClassModeEnabled = (): boolean => classModeEnabled;

export const setClassModeEnabled = (enabled: boolean): void => {
  classModeEnabled = enabled;
};
