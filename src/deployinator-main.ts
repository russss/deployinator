import { LitElement, html, css } from 'lit'
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
        this.beep = new Audio('/piep.wav')
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
            let submitForm = null
            if (this.itemData) {
                info = html` <tr>
                        <td>Device</td>
                        <td>${this.itemData.name}</td>
                    </tr>
                    <tr>
                        <td>Model</td>
                        <td>${this.itemData.device_type.model}</td>
                    </tr>`

                submitForm = html`
                    <form @submit=${this.markDeployed}>
                        <button type="submit">Mark as deployed</button>
                    </form>
                `
            }
            return html`
                <table>
                    <tr>
                        <td>Serial</td>
                        <td>${this.serial}</td>
                    </tr>
                    <tr>
                        <td>Position</td>
                        <td>${this.position.latitude}, ${this.position.longitude}</td>
                    </tr>
                    <tr>
                        <td>Accuracy</td>
                        <td>${this.position.accuracy}m</td>
                    </tr>
                    ${info}
                </table>
                ${submitForm}
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

    logout() {
        localStorage.removeItem('netboxToken')
        this.netboxToken = undefined
        this.state = State.Login
    }

    newBarcode(event: any) {
        const data = event.detail
        if (!serial_number_regex.test(data.code)) {
            return
        }
        this.beep.play()
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
            .then((response) => {
                if (response.status == 403) {
                    this.logout()
                    return Promise.reject('403')
                }
                return response
            })
            .then((response) => response.json())
            .then((data) => {
                if (data.count == 0) {
                    this.error = 'Item not found in Netbox'
                    this.state = State.Scan
                    return
                } else if (data.count > 1) {
                    this.error = 'Unexpected number of devices found'
                    this.state = State.Scan
                    return
                }
                this.itemData = data.results[0]
            })
    }

    updatePosition(position) {
        if (position.coords.accuracy > 20 && import.meta.env.PROD) {
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

    static styles = css`
        .error {
            padding: 5px;
            background-color: #ffaaaa;
        }
    `
}

declare global {
    interface HTMLElementTagNameMap {
        'deployinator-main': Deployinator
    }
}
