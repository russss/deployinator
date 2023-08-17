import { LitElement, html } from 'lit'
import { customElement, state } from 'lit/decorators.js'

enum State {
    Login,
    Scan,
    WaitingForGeolocation,
    Confirm,
}

const serial_number_regex = /^[\w\d]*$/

@customElement('deployinator-main')
export class Deployinator extends LitElement {
    @state()
    private position: GeolocationCoordinates | undefined

    @state()
    private state: State = State.Login

    @state()
    private serial: string | undefined

    private netboxToken: string | undefined = localStorage.getItem('netboxToken')

    @state()
    private itemData: any

    @state()
    private error: string | undefined

    constructor() {
        super()
        if (this.netboxToken) {
            this.state = State.Scan
        }
    }

    render() {
        let error = null
        if (this.error) {
            error = html`<div class="error">${this.error}</div>`
        }

        if (this.state == State.Login) {
            return html`
                ${error}
                <netbox-login @loginSuccess=${this.loginSuccess}></netbox-login>
            `
        } else if (this.state == State.Scan) {
            return html`
                ${error}
                <barcode-scanner @scanned=${this.newBarcode}></barcode-scanner>
            `
        } else if (this.state == State.WaitingForGeolocation) {
            return html`<div>Scanned. Serial: ${this.serial}. Waiting for geolocation...</div>`
        } else if (this.state == State.Confirm) {
            let info = null
            let submitform = null
            if (this.itemData) {
                info = html` <div>
                    <p>Device: ${this.itemData.name}</p>
                </div>`

                submitform = html`
                    <form @submit=${this.markDeployed}>
                        <button type="submit">Mark as deployed</button>
                    </form>
                `
            }
            return html`
                <p>
                    Scanned. Serial: ${this.serial}. Position: ${this.position.latitude},
                    ${this.position.longitude}
                </p>
                ${info} ${submitform}
            `
        }
    }

    firstUpdated() {
        this.watchID = navigator.geolocation.watchPosition(
            (position) => this.updatePosition(position),
            (err) => {
                console.log(err)
                this.position = undefined
            },
            {
                enableHighAccuracy: true,
                maximumAge: 30000,
                timeout: 27000,
            }
        )
    }

    loginSuccess(event: any) {
        console.log(event.detail)
        localStorage.setItem('netboxToken', event.detail.token)
        this.netboxToken = event.detail.token
        this.state = State.Scan
    }

    newBarcode(event: any) {
        const data = event.detail
        if (!serial_number_regex.test(data.code)) {
            return
        }
        if (!this.position) {
            this.state = State.WaitingForGeolocation
        } else {
            this.state = State.Confirm
        }
        this.serial = data.code
        this.itemData = null
        this.error = null

        fetch(`https://netbox.c3noc.net/api/dcim/devices/?serial=${this.serial}`, {
            headers: {
                Authorization: `Token ${this.netboxToken}`,
                Accept: 'application/json',
            },
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.results.length != 1) {
                    console.log('Unexpected number of devices found')
                    this.error = 'Unexpected number of devices found'
                    this.state = State.Scan
                    return
                }
                this.itemData = data.results[0]
            })
    }

    updatePosition(position) {
        if (position.coords.accuracy > 100) {
            console.log('Low accuracy position', position)
            this.position = undefined
            return
        }
        console.log('New position', position)
        this.position = position.coords
        if (this.state == State.WaitingForGeolocation) {
            this.state = State.Confirm
        }
    }

    markDeployed(e: Event) {
        e.preventDefault()
        const updated_fields = {
            id: this.itemData.id,
            custom_fields: {
                geoloc: `${this.position.latitude}, ${this.position.longitude}`,
            },
        }
        fetch(`https://netbox.c3noc.net/api/dcim/devices/${this.itemData.id}/`, {
            method: 'PATCH',
            headers: {
                Authorization: `Token ${this.netboxToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updated_fields),
        }).then((response) => {
            if (response.status != 200) {
                console.error(response)
            }
            this.state = State.Scan
        })
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'deployinator-main': Deployinator
    }
}
