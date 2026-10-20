# Linguagem Ubíqua (Ubiquitous Language)

Glossário de termos do subdomínio de Eventos, Pedidos e Lista de Espera:

1. **Lista de Espera (`WaitingList`)**  
   Agregado responsável por gerenciar a fila de clientes interessados em vagas de uma seção esgotada de um evento, garantindo ordem de chegada e integridade das entradas.

2. **Entrada na Lista de Espera (`WaitingListEntry`)**  
   Entidade filha do agregado `WaitingList` que representa a inscrição de um cliente específico na fila, contendo seu identificador, ordem de chegada e status atual.

3. **Cancelamento de Pedido (`Order.cancel / OrderCancelled`)**  
   Operação de domínio executada sobre o agregado `Order` que invalida uma compra existente, alterando seu status para `CANCELLED` e emitindo o evento de domínio `OrderCancelled`.

4. **Liberação de Lugar (`Event.markSpotAsAvailable / EventSpotReleased`)**  
   Reação de domínio ao cancelamento de pedido na qual o agregado `Event` desce a hierarquia até o `EventSpot`, tornando o lugar disponível novamente e emitindo o evento `EventSpotReleased`.

5. **Trava de Reserva (`SpotReservation`)**  
   Mecanismo de controle de concorrência que bloqueia o lugar durante e após a compra; deve ser removida da persistência quando o lugar é devolvido à disponibilidade.

6. **Seção Esgotada (`Sold Out Section`)**  
   Condição em que uma seção publicada não possui nenhum lugar disponível para compra imediata, sendo o critério de negócio obrigatório para permitir o ingresso de clientes na lista de espera.

7. **Oferta de Lugar / Notificação (`SpotOfferedToWaitingCustomer`)**  
   Evento de domínio emitido pelo agregado `WaitingList` quando a política promove a primeira entrada pendente da fila para o status `NOTIFIED` após a liberação de um assento.

8. **Evento de Integração (`SpotOfferedToWaitingCustomerIntegrationEvent`)**  
   Mensagem assíncrona que cruza a fronteira do contexto de venda de ingressos em direção a outros serviços (como `apps/emails`), transmitida via fila Bull e RabbitMQ.

9. **Status da Entrada (`WaitingListStatus: PENDING | NOTIFIED`)**  
   Estados possíveis de uma entrada na fila: nasce como `PENDING` (na fila aguardando vaga) e transita para `NOTIFIED` (notificado de que abriu uma vaga).

10. **Política de Notificação de Espera (`Policy: Spot Released -> Offer Spot`)**  
    Regra de processo desacoplada que reage ao evento `EventSpotReleased`, localiza a fila da respectiva seção e aciona o agregado `WaitingList` para promover o primeiro cliente da fila.
