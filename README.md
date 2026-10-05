# Nassau Frete

Site estático para consultar CEPs brasileiros e estimar o frete de moto a partir de uma unidade da UNINASSAU em Fortaleza.

## Como funciona

1. O site consulta o CEP na [BrasilAPI CEP v2](https://brasilapi.com.br/docs#tag/CEP-V2), com fallback para a [ViaCEP](https://viacep.com.br/).
2. Quando a resposta do CEP não inclui coordenadas, tenta localizar o endereço com a [API Nominatim do OpenStreetMap](https://nominatim.org/release-docs/latest/api/Search/).
3. A [API pública OSRM](https://project-osrm.org/docs/v26.4.0/http) estima a rota viária e sua distância.
4. O frete é calculado com os parâmetros editáveis no formulário: `taxa base + distância em km × valor por km`.

O projeto não recebe uma cotação ao vivo da Uber. O endpoint oficial de estimativa de preço da Uber exige aprovação e credenciais; por isso, o preço exibido é uma simulação baseada na tarifa que a pessoa configurar. O valor real do Uber Moto deve ser consultado no app e pode variar por horário e demanda.

As coordenadas de destino associadas a um CEP podem representar uma área aproximada. O OSRM usa o perfil `driving` com dados do OpenStreetMap; o percurso pode diferir do trajeto feito por uma moto.

## Abrir o site

Abra `index.html` em um navegador com conexão à internet. As consultas são feitas diretamente às APIs públicas pelo navegador e não exigem chave de API.

Para publicar pelo GitHub Pages, envie os arquivos desta pasta para a raiz de um repositório e habilite Pages para a branch principal, usando a pasta raiz (`/`).

## Unidades de origem

- **UNINASSAU Aguanambi:** Av. Aguanambi, 251 — José Bonifácio, Fortaleza/CE.
- **UNINASSAU Parangaba:** Rua Germano Franck, 613 — Parangaba, Fortaleza/CE.

Os valores de referência de origem estão em `app.js` e podem ser ajustados se a entrada usada para coleta estiver em outro ponto do campus.

