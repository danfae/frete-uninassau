const CAMPUSES = {
  aguanambi: {
    name: 'UNINASSAU Aguanambi',
    shortName: 'Aguanambi',
    address: 'Av. Aguanambi, 251, José Bonifácio, Fortaleza - CE',
    lat: -3.7390998,
    lon: -38.5241174,
  },
  parangaba: {
    name: 'UNINASSAU Parangaba',
    shortName: 'Parangaba',
    address: 'Rua Germano Franck, 613, Parangaba, Fortaleza - CE',
    lat: -3.7771,
    lon: -38.5618,
  },
};

const form = document.querySelector('#quote-form');
const cepInput = document.querySelector('#cep');
const campusInput = document.querySelector('#campus');
const baseRateInput = document.querySelector('#base-rate');
const kmRateInput = document.querySelector('#km-rate');
const submitButton = document.querySelector('#submit-button');
const buttonLabel = submitButton.querySelector('.button-label');
const message = document.querySelector('#form-message');
const resultCard = document.querySelector('#result-card');

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function onlyDigits(value) {
  return value.replace(/\D/g, '').slice(0, 8);
}

function formatCep(value) {
  const digits = onlyDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

function setMessage(text, type = 'error') {
  message.textContent = text;
  message.classList.toggle('success', type === 'success');
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.classList.toggle('is-loading', loading);
  buttonLabel.textContent = loading ? 'Calculando…' : 'Calcular';
  form.setAttribute('aria-busy', String(loading));
}

function parseRate(value) {
  const normalized = String(value).trim().replace(',', '.');
  return normalized === '' ? NaN : Number(normalized);
}

function getRates() {
  const base = parseRate(baseRateInput.value);
  const perKm = parseRate(kmRateInput.value);

  if (!Number.isFinite(base) || base < 0 || base > 1000) {
    throw new Error('Informe uma taxa base entre R$ 0,00 e R$ 1.000,00.');
  }
  if (!Number.isFinite(perKm) || perKm < 0 || perKm > 1000) {
    throw new Error('Informe um valor por quilômetro entre R$ 0,00 e R$ 1.000,00.');
  }
  return { base, perKm };
}

function saveRates() {
  try {
    localStorage.setItem('frete-nassau-base', baseRateInput.value);
    localStorage.setItem('frete-nassau-km', kmRateInput.value);
  } catch {
    // The estimate still works when browser storage is unavailable.
  }
}

function restoreRates() {
  try {
    const savedBase = localStorage.getItem('frete-nassau-base');
    const savedKm = localStorage.getItem('frete-nassau-km');
    if (savedBase !== null) baseRateInput.value = savedBase;
    if (savedKm !== null) kmRateInput.value = savedKm;
  } catch {
    // Use the example values already present in the form.
  }
}

async function fetchJson(url, timeoutMs = 14000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    let data;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { response, data };
  } finally {
    window.clearTimeout(timeout);
  }
}

function readCoordinates(data) {
  const coordinates = data?.location?.coordinates;
  const lat = Number(coordinates?.latitude);
  const lon = Number(coordinates?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon }
    : null;
}

async function lookupBrasilApi(cep) {
  const { response, data } = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (!response.ok || !data || data.errors) return null;

  return {
    street: data.street || '',
    neighborhood: data.neighborhood || '',
    city: data.city || '',
    state: data.state || '',
    cep: data.cep || cep,
    coordinates: readCoordinates(data),
  };
}

async function lookupViaCep(cep) {
  const { response, data } = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (!response.ok || !data || data.erro) return null;

  return {
    street: data.logradouro || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
    cep: data.cep || formatCep(cep),
    coordinates: null,
  };
}

async function geocodeAddress(address, cep) {
  const query = [address.street, address.neighborhood, address.city, address.state, cep, 'Brasil']
    .filter(Boolean)
    .join(', ');
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'br',
  });
  const { response, data } = await fetchJson(`https://nominatim.openstreetmap.org/search?${params}`);
  const lat = Number(data?.[0]?.lat);
  const lon = Number(data?.[0]?.lon);
  if (!response.ok || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function lookupDestination(cep) {
  let address = null;
  try {
    address = await lookupBrasilApi(cep);
  } catch {
    // ViaCEP is a public fallback if BrasilAPI is temporarily unavailable.
  }

  if (!address) {
    try {
      address = await lookupViaCep(cep);
    } catch {
      throw new Error('Não foi possível consultar o CEP agora. Confira sua conexão e tente novamente.');
    }
  }

  if (!address) throw new Error('CEP não encontrado. Confira os 8 números e tente novamente.');

  if (!address.coordinates) {
    try {
      address.coordinates = await geocodeAddress(address, cep);
    } catch {
      address.coordinates = null;
    }
  }

  if (!address.coordinates) {
    throw new Error('O endereço foi localizado, mas não há coordenadas para traçar a rota. Tente um CEP de rua próximo.');
  }

  return address;
}

async function getRoute(origin, destination) {
  const coordinates = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=false`;
  let response;
  let data;
  try {
    ({ response, data } = await fetchJson(url, 18000));
  } catch {
    throw new Error('O serviço de rotas está indisponível no momento. Tente novamente em instantes.');
  }

  if (!response.ok || data?.code !== 'Ok' || !data.routes?.length) {
    throw new Error('Não foi possível traçar uma rota viária para este CEP. Confira o destino e tente novamente.');
  }
  return data.routes[0];
}

function formatAddress(address) {
  return [address.street, address.neighborhood, address.city, address.state]
    .filter(Boolean)
    .join(' · ') || `CEP ${formatCep(address.cep)}`;
}

function renderResult({ campus, address, cep, distanceKm, rates }) {
  const total = rates.base + distanceKm * rates.perKm;
  const roundedTotal = Math.round((total + Number.EPSILON) * 100) / 100;
  const addressText = formatAddress(address);

  document.querySelector('#origin-label').textContent = campus.name;
  document.querySelector('#destination-label').textContent = address.city
    ? `${address.city}${address.state ? `, ${address.state}` : ''}`
    : `CEP ${formatCep(cep)}`;
  document.querySelector('#address-label').textContent = addressText;
  document.querySelector('#distance-label').textContent = `${distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
  document.querySelector('#price-label').textContent = money.format(roundedTotal);
  document.querySelector('#price-formula').textContent = `${money.format(rates.base)} + ${distanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km × ${money.format(rates.perKm)}/km`;

  const destinationQuery = `${addressText}, CEP ${formatCep(cep)}, Brasil`;
  const mapsParams = new URLSearchParams({
    api: '1',
    origin: campus.address,
    destination: destinationQuery,
    travelmode: 'driving',
  });
  document.querySelector('#maps-link').href = `https://www.google.com/maps/dir/?${mapsParams}`;
  resultCard.hidden = false;
}

cepInput.addEventListener('input', () => {
  const start = cepInput.selectionStart;
  const before = cepInput.value;
  cepInput.value = formatCep(before);
  if (start === before.length) cepInput.setSelectionRange(cepInput.value.length, cepInput.value.length);
  message.textContent = '';
});

baseRateInput.addEventListener('change', saveRates);
kmRateInput.addEventListener('change', saveRates);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  const cep = onlyDigits(cepInput.value);
  if (cep.length !== 8) {
    setMessage('Digite um CEP válido com 8 números.');
    cepInput.focus();
    return;
  }

  let rates;
  try {
    rates = getRates();
  } catch (error) {
    setMessage(error.message);
    return;
  }

  const campus = CAMPUSES[campusInput.value];
  setLoading(true);
  setMessage('Consultando CEP e calculando a rota…', 'success');

  try {
    const address = await lookupDestination(cep);
    const route = await getRoute(campus, address.coordinates);
    const distanceKm = route.distance / 1000;
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      throw new Error('A rota retornou uma distância inválida. Tente outro CEP.');
    }
    renderResult({ campus, address, cep, distanceKm, rates });
    setMessage('Rota calculada. A distância pode variar conforme o endereço exato.', 'success');
    saveRates();
  } catch (error) {
    setMessage(error.message || 'Ocorreu um erro ao calcular o frete. Tente novamente.');
  } finally {
    setLoading(false);
  }
});

restoreRates();

