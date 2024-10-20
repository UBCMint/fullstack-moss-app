use actix_web::{ web, App, HttpServer, Responder, HttpResponse };

async fn start_simulation() -> impl Responder {
    HttpResponse::Ok().body("Simulation started")
}

async fn end_simulation() -> impl Responder {
    HttpResponse::Ok().body("Simulation stopped")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new( || {
        App::new()
            .route("/start", web::post().to(start_simulation))
            .route("/end", web::post().to(end_simulation))
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
