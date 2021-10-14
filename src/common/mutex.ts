const locks: { [key: string]: boolean } = {};

const withMutex = (key: string, fn: () => Promise<any>) => {
  if (!locks[key]) {
    locks[key] = true;
    fn()
      .then(() => (locks[key] = false))
      .catch(() => (locks[key] = false));

    return true;
  }

  return false;
};

export default withMutex;
