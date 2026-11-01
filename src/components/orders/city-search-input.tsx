export type CityOption = {
  id: string;
  name: string;
  value: string;
};

export function CitySearchInput({
  listId,
  cities,
  defaultValue,
  placeholder,
  invalid,
}: {
  listId: string;
  cities: CityOption[];
  defaultValue: string;
  placeholder: string;
  invalid: boolean;
}) {
  return (
    <>
      <input
        name="city"
        type="search"
        list={listId}
        autoComplete="address-level2"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={invalid}
        spellCheck={false}
        required
      />
      <datalist id={listId}>
        {cities.map((city) => (
          <option value={city.value} key={city.id}>
            {city.name}
          </option>
        ))}
      </datalist>
    </>
  );
}
