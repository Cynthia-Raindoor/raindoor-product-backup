const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
require('dotenv').config();

const app = express();
app.use(express.json());

// --- MIDDLEWARE DE SEGURIDAD PARA SHOPIFY ---
app.use((req, res, next) => {
    const shop = req.query.shop || req.body.shop;
    if (shop) {
        res.setHeader("Content-Security-Policy", `frame-ancestors https://${shop} https://admin.shopify.com;`);
    }
    next();
});

const {
    SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET,
    HOST, // La URL de tu App (ej: https://tu-app.render.com)
    SCOPES = 'read_products',
} = process.env;

// --- ESTRUCTURA DE ALMACENAMIENTO TEMPORAL ---
// En una app real usarías una base de datos para guardar el accessToken por tienda.
const activeShops = {};

// --- RUTAS DE OAUTH ---

app.get('/auth', (req, res) => {
    const shop = req.query.shop;
    if (shop) {
        const state = nonce();
        const redirectUri = `${HOST}/auth/callback`;
        const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SCOPES}&state=${state}&redirect_uri=${redirectUri}`;

        res.cookie('state', state, { httpOnly: true, secure: true, sameSite: 'none' });

        // ESCAPAR DEL IFRAME: Shopify bloquea redirecciones directas dentro de un iframe
        res.send(`
            <script type="text/javascript">
                window.top.location.href = "${installUrl}";
            </script>
        `);
    } else {
        return res.status(400).send('Falta el parámetro ?shop=tu-tienda.myshopify.com');
    }
});

app.get('/auth/callback', async (req, res) => {
    const { shop, hmac, code, state } = req.query;
    const stateCookie = cookie.parse(req.headers.cookie || '').state;

    if (state !== stateCookie) {
        return res.status(403).send('Origen de la solicitud no verificado');
    }

    if (shop && hmac && code) {
        // Validación HMAC
        const map = Object.assign({}, req.query);
        delete map['hmac'];
        const message = querystring.stringify(map);
        const generatedHash = crypto
            .createHmac('sha256', SHOPIFY_API_SECRET)
            .update(message)
            .digest('hex');

        if (generatedHash !== hmac) {
            return res.status(400).send('Validación HMAC fallida');
        }

        // Intercambio de código por Access Token
        try {
            const accessTokenRequestUrl = `https://${shop}/admin/oauth/access_token`;
            const accessTokenPayload = {
                client_id: SHOPIFY_API_KEY,
                client_secret: SHOPIFY_API_SECRET,
                code,
            };

            const response = await axios.post(accessTokenRequestUrl, accessTokenPayload);
            const accessToken = response.data.access_token;

            // Guardamos el token en memoria (temporal)
            activeShops[shop] = accessToken;

            console.log(`✅ App instalada en: ${shop}`);
            res.redirect(`/?shop=${shop}`);

        } catch (error) {
            console.error(error);
            res.status(500).send('Error obteniendo el access token');
        }
    } else {
        res.status(400).send('Faltan parámetros requeridos');
    }
});

// --- INTERFAZ PRINCIPAL ---

app.get('/', (req, res) => {
    const shop = req.query.shop;
    if (!shop || !activeShops[shop]) {
        return res.send(`
            <h1>Raindoor Product Backup</h1>
            <p>Introduce tu tienda para comenzar:</p>
            <form action="/auth" method="get">
                <input type="text" name="shop" placeholder="tu-tienda.myshopify.com" required>
                <button type="submit">Instalar App</button>
            </form>
        `);
    }

    res.send(`
        <h1>Raindoor Product Backup</h1>
        <p>Tienda conectada: <strong>${shop}</strong></p>
        <button onclick="startBackup('${shop}')" id="btnBackup">Generar Backup (JSON)</button>
        <div id="status"></div>
        <script>
            async function startBackup(shop) {
                const btn = document.getElementById('btnBackup');
                const status = document.getElementById('status');
                btn.disabled = true;
                status.innerText = 'Cargando productos... esto puede tardar unos minutos para 1,500 productos.';

                try {
                    const response = await fetch('/api/backup?shop=' + shop);
                    const data = await response.json();
                    
                    if(data.success) {
                        // Crear un blob y descargar el archivo
                        const blob = new Blob([JSON.stringify(data.products, null, 2)], {type: 'application/json'});
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'backup-productos-' + new Date().toISOString().split('T')[0] + '.json';
                        document.body.appendChild(a);
                        a.click();
                        status.innerText = '✅ Backup completado y descargado: ' + data.products.length + ' productos.';
                    } else {
                        status.innerText = '❌ Error: ' + data.error;
                    }
                } catch (e) {
                    status.innerText = '❌ Error de conexión: ' + e.message;
                } finally {
                    btn.disabled = false;
                }
            }
        </script>
    `);
});

// --- LÓGICA DE BACKUP (GRAPHQL) ---

app.get('/api/backup', async (req, res) => {
    const shop = req.query.shop;
    const accessToken = activeShops[shop];

    if (!accessToken) {
        return res.status(401).json({ success: false, error: 'No autorizado' });
    }

    try {
        let allProducts = [];
        let hasNextPage = true;
        let cursor = null;

        while (hasNextPage) {
            const query = `
                query getProducts($cursor: String) {
                    products(first: 250, after: $cursor) {
                        pageInfo {
                            hasNextPage
                        }
                        edges {
                            cursor
                            node {
                                id
                                title
                                handle
                                descriptionHtml
                                vendor
                                productType
                                status
                                tags
                                variants(first: 100) {
                                    edges {
                                        node {
                                            id
                                            title
                                            sku
                                            price
                                            inventoryQuantity
                                            barcode
                                        }
                                    }
                                }
                                images(first: 10) {
                                    edges {
                                        node {
                                            url
                                            altText
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const response = await axios({
                url: `https://${shop}/admin/api/2024-01/graphql.json`,
                method: 'post',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
                data: {
                    query,
                    variables: { cursor }
                }
            });

            const data = response.data.data.products;
            const fetchedProducts = data.edges.map(edge => edge.node);
            allProducts = allProducts.concat(fetchedProducts);

            hasNextPage = data.pageInfo.hasNextPage;
            if (hasNextPage) {
                cursor = data.edges[data.edges.length - 1].cursor;
            }
        }

        res.json({ success: true, products: allProducts });

    } catch (error) {
        console.error('Backup Error:', error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, error: 'Error al obtener productos' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backup App lista en el puerto ${PORT}`);
});
