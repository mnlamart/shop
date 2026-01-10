# Mondial Relay Shipment API - Request Schema Documentation

**Source:** https://storage.mondialrelay.fr/Mondial-Relay-Shipment-API-.Request.1.0.xsd

## Root Element

### ShipmentCreationRequest
The root element of the request.

---

## 1. Context (Required)

Authentication and API configuration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Login` | string | ✅ Yes | User name for authentication (provided by Mondial Relay) |
| `Password` | string | ✅ Yes | Password for authentication (provided by Mondial Relay) |
| `CustomerId` | string | ✅ Yes | Customer ID (2-8 characters, provided by Mondial Relay) |
| `Culture` | string | ✅ Yes | Culture code (format: `\w{2}-\w{2}`, e.g., "fr-FR", "en-US") |
| `VersionAPI` | string | ✅ Yes | API version (e.g., "1.0") |

---

## 2. OutputOptions (Required)

Label output configuration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `OutputFormat` | string | ❌ No | Printer model for ZPL code (optional) |
| `OutputType` | string | ✅ Yes | Output format type (e.g., "PDF", "PdfUrl", "ZPL", "IPL", "QRCODE") |

---

## 3. ShipmentsList (Required)

Contains one or more shipment requests.

### Shipment (Required, can have multiple)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `OrderNo` | string | ❌ No | Customer internal order reference (max 15 chars) |
| `CustomerNo` | string | ❌ No | Customer number (max 9 chars) |
| `ParcelCount` | int | ✅ Yes | Number of parcels (1-99) |
| `ShipmentValue` | MonetaryAmountType | ✅ Yes | Value of the content (with Currency attribute) |
| `Options` | OptionListType | ❌ No | Optional shipment options |
| `DeliveryMode` | ProductConfigurationType | ✅ Yes | Delivery mode configuration |
| `CollectionMode` | ProductConfigurationType | ✅ Yes | Collection mode configuration |
| `Parcels` | ParcelListType | ✅ Yes | List of parcels |
| `DeliveryInstruction` | string | ❌ No | Delivery instructions (optional note) |
| `Sender` | SenderDetailsType | ✅ Yes | Sender address information |
| `Recipient` | RecipientDetailsType | ✅ Yes | Recipient address information |

---

## 4. ProductConfigurationType

Used for `DeliveryMode` and `CollectionMode`.

**Structure:**
- Empty sequence (no child elements)
- **Attributes:**
  - `Mode` (string, **required**): Product code (e.g., "24R", "24L", "24X", "REL", "CCC")
  - `Location` (string, **optional**): Location code where presentation will be done (e.g., parcel shop ID like "FR00001" for parcel shop delivery)

**Example:**
```xml
<DeliveryMode Mode="24R"></DeliveryMode>
<DeliveryMode Mode="24R" Location="FR31670"></DeliveryMode>
```

---

## 5. MonetaryAmountType

Used for `ShipmentValue`.

**Attributes:**
- `Currency` (string, required): Currency code (e.g., "EUR")
- `Amount` (string, required): The monetary amount as a decimal string (e.g., "136.79")

**Example:**
```xml
<ShipmentValue Currency="EUR" Amount="136.79"></ShipmentValue>
```

---

## 6. ParcelListType

Contains one or more `Parcel` elements.

### Parcel

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Weight` | MeasureAmountType | ✅ Yes | Weight of the parcel (in grams) |
| `Length` | MeasureAmountType | ❌ No | Length of the parcel (in cm) |
| `Width` | MeasureAmountType | ❌ No | Width of the parcel (in cm) |
| `Depth` | MeasureAmountType | ❌ No | Depth of the parcel (in cm) |
| `Description` | string | ❌ No | Brief description of parcel content (max 40 chars) |

### MeasureAmountType

**Attributes:**
- `Value` (float, **required**): The numeric value
- `Unit` (string, **required**): The unit (e.g., "gr" for grams, "cm" for centimeters)

**Example:**
```xml
<Weight Value="1468" Unit="gr"/>
<Length Value="30" Unit="cm"/>
```

---

## 7. AddressType

Used for both Sender and Recipient addresses.

| Field | Type | Required | Max Length | Description |
|-------|------|----------|------------|-------------|
| `Title` | string | ❌ No | 30 | Person title (Mr, Ms, Miss, etc.) |
| `Firstname` | string | ❌ No | 30 | First name (if address is a person) |
| `Lastname` | string | ❌ No | 30 | Last name (if address is a person) |
| `Streetname` | string | ✅ Yes | - | Street name |
| `HouseNo` | string | ❌ No | 10 | House/building number |
| `CountryCode` | string | ✅ Yes | 2 | ISO 3166-1-alpha-2 country code (e.g., "FR", "DE", "GB") |
| `PostCode` | string | ✅ Yes | 10 | Postal code |
| `City` | string | ✅ Yes | 30 | City name |
| `AddressAdd1` | string | ❌ No | 30 | Additional address info |
| `AddressAdd2` | string | ❌ No | 30 | Additional address info (e.g., Building, Floor) |
| `AddressAdd3` | string | ❌ No | 30 | Additional address info (e.g., locality name) |
| `PhoneNo` | string | ❌ No | 20 | Phone number (pattern: `\+\d{3,20}`, e.g., "+33123456789") |
| `MobileNo` | string | ❌ No | 20 | Mobile number (pattern: `\+\d{3,20}`) |
| `Email` | string | ❌ No | 70 | Email address (format: xxxxxx@xxx.xx) |

**Important Notes:**
- For Recipient: `Address` is **not nullable** (nillable="false")
- For Sender: `Address` is **nullable** (nillable="true")
- `Streetname` + `HouseNo` combined should not exceed 40 characters for recipient address

---

## 8. SenderDetailsType

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Address` | AddressType | ✅ Yes | Sender address (nullable) |

---

## 9. RecipientDetailsType

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `Address` | AddressType | ✅ Yes | Recipient address (not nullable) |

---

## Common Product Codes

### Delivery Modes
- `24R`: Point Relais® L (Large) - Standard pickup point delivery
- `24L`: Point Relais® XL - Extra large pickup point delivery
- `24X`: Point Relais® XXL - Extra extra large pickup point delivery
- `HOM`: Home delivery without appointment
- `LD1`: Single-man home delivery with appointment
- `LDS`: Two-man home delivery with appointment

### Collection Modes
- `REL`: Relay collection
- `CCC`: Customer collection center

---

## Complete Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ShipmentCreationRequest xmlns="http://www.example.org/Request">
    <Context>
        <Login>CC23OXZ5@business-api.mondialrelay.com</Login>
        <Password>your-password</Password>
        <CustomerId>CC23OXZ5</CustomerId>
        <Culture>fr-FR</Culture>
        <VersionAPI>1.0</VersionAPI>
    </Context>
    <OutputOptions>
        <OutputFormat>10x15</OutputFormat>
        <OutputType>PdfUrl</OutputType>
    </OutputOptions>
    <ShipmentsList>
        <Shipment>
            <OrderNo>ORD-000001</OrderNo>
            <ParcelCount>1</ParcelCount>
            <ShipmentValue Currency="EUR" Amount="136.79"></ShipmentValue>
            <DeliveryMode Mode="24R" Location="FR-31670"></DeliveryMode>
            <CollectionMode Mode="REL" Location=""></CollectionMode>
            <Parcels>
                <Parcel>
                    <Weight Value="1468" Unit="gr"/>
                </Parcel>
            </Parcels>
            <DeliveryInstruction>Point Relais: 31670</DeliveryInstruction>
            <Sender>
                <Address>
                    <Lastname>Store Name</Lastname>
                    <Streetname>13 Rue du Moulin de Pierre</Streetname>
                    <CountryCode>FR</CountryCode>
                    <PostCode>92140</PostCode>
                    <City>Clamart</City>
                    <PhoneNo>+33628634190</PhoneNo>
                    <Email>store@example.com</Email>
                </Address>
            </Sender>
            <Recipient>
                <Address>
                    <Lastname>Customer Name</Lastname>
                    <Streetname>LE MONDE DU COLIS, 8 RUE DE PARIS</Streetname>
                    <CountryCode>FR</CountryCode>
                    <PostCode>92190</PostCode>
                    <City>MEUDON</City>
                    <Email>customer@example.com</Email>
                </Address>
            </Recipient>
        </Shipment>
    </ShipmentsList>
</ShipmentCreationRequest>
```

---

## Validation Rules Summary

### Required Fields (minOccurs=1)
- Context: Login, Password, CustomerId, Culture, VersionAPI
- OutputOptions: OutputType
- Shipment: ParcelCount, ShipmentValue, DeliveryMode, CollectionMode, Parcels, Sender, Recipient
- Parcel: Weight
- Address: Streetname, CountryCode, PostCode, City

### Important Constraints
- `CustomerId`: 2-8 characters
- `Culture`: Must match pattern `\w{2}-\w{2}` (e.g., "fr-FR")
- `ParcelCount`: 1-99
- `PhoneNo`/`MobileNo`: Must match pattern `\+\d{3,20}`
- `Streetname` + `HouseNo`: Combined max 40 characters for recipient
- `OrderNo`: Max 15 characters
- `CustomerNo`: Max 9 characters

