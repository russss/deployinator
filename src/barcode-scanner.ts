import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import Quagga from '@ericblade/quagga2'

@customElement('barcode-scanner')
export class BarcodeScanner extends LitElement {
    render() {
        return html` <div id="video"></div> `
    }

    firstUpdated() {
        const video = this.renderRoot.querySelector('#video')
        if (!video) {
            return
        }

        Quagga.init(
            {
                inputStream: {
                    name: 'Live',
                    type: 'LiveStream',
                    target: video,
                },
                locate: true,
                decoder: {
                    readers: ['code_128_reader'],
                },
            },
            function (err) {
                if (err) {
                    console.log(err)
                    return
                }
                Quagga.start()
            }
        )

        Quagga.onDetected((data: any) => this.onDetected(data))
    }

    disconnectedCallback() {
        Quagga.stop()
    }

    onDetected(data: any) {
        let errors = 0,
            count = 0
        for (const res of data.codeResult.decodedCodes) {
            if (res.error) {
                errors += res.error
            }
            count++
        }
        if (errors / count > 0.1) {
            return
        }
        this.dispatchEvent(new CustomEvent('scanned', { detail: { code: data.codeResult.code } }))
    }

    static styles = css`
        #video {
            width: 100%;
        }
    `
}

declare global {
    interface HTMLElementTagNameMap {
        'barcode-scanner': BarcodeScanner
    }
}
