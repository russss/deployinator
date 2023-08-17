import { LitElement, html } from 'lit'
import { customElement } from 'lit/decorators.js'

@customElement('netbox-login')
export class NetboxLogin extends LitElement {
    netboxURL = 'https://netbox.c3noc.net'

    render() {
        return html`<div id="netbox-login">
            <form @submit=${this.login}>
                <label for="username">Username</label>
                <input type="text" id="username" name="username" />
                <label for="password">Password</label>
                <input type="password" id="password" name="password" />
                <input type="submit" value="Submit" />
            </form>
        </div> `
    }

    login(e: Event) {
        e.preventDefault()
        fetch(this.netboxURL + '/api/users/tokens/provision/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                username: (this.renderRoot.querySelector('#username') as HTMLInputElement).value,
                password: (this.renderRoot.querySelector('#password') as HTMLInputElement).value,
            }),
        }).then((response) => {
            if (response.status != 201) {
                console.error(response)
                return
            }
            response.json().then((data) => {
                this.dispatchEvent(new CustomEvent('loginSuccess', { detail: { token: data.key } }))
            })
        })
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'netbox-login': NetboxLogin
    }
}
