(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./address-reference'));
  else root.NetanyaReference = factory(root.AddressReference);
}(typeof self !== 'undefined' ? self : this, function(reference) {
  let pending;

  async function lookup(street, number, city, includeVariants = false) {
    if (!reference.canLookup(street, number, city)) return [];
    if (!pending) {
      pending = fetch('./data/netanya-addresses.json').then(response => {
        if (!response.ok) throw new Error('Address reference unavailable');
        return response.json();
      }).catch(() => {
        pending = undefined;
        return null;
      });
    }
    return reference.lookup(await pending, street, number, city, includeVariants);
  }

  return {lookup};
}));
