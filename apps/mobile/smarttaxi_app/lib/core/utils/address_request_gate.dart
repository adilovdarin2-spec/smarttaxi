/// Changing a pin or query invalidates its address before the next debounced
/// lookup starts. Closing/reopening also starts a new generation.
class AddressRequestGate {
  int _generation = 0;

  int invalidate() => ++_generation;

  bool accepts(int generation) => generation == _generation;
}
